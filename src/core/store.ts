import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Comment, CommentFile, PrRef, Reply } from "./types";

/** One JSON file per PR under ~/.margin/comments; plain files are the API. */
export function marginHome(): string {
	return process.env.MARGIN_HOME ?? join(homedir(), ".margin");
}

function commentsDir(): string {
	return join(marginHome(), "comments");
}

export function prKey(ref: PrRef): string {
	return `${ref.owner}__${ref.repo}__${ref.number}`;
}

export function prUrl(ref: PrRef): string {
	return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;
}

function fileFor(ref: PrRef): string {
	return join(commentsDir(), `${prKey(ref)}.json`);
}

export function newId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function loadComments(ref: PrRef): Promise<CommentFile> {
	const f = Bun.file(fileFor(ref));
	if (!(await f.exists())) return { url: prUrl(ref), comments: [] };
	return (await f.json()) as CommentFile;
}

export async function listComments(ref: PrRef): Promise<Comment[]> {
	return (await loadComments(ref)).comments;
}

/** Write through a temp file and rename, so a concurrent reader never sees half a file. */
async function saveComments(ref: PrRef, data: CommentFile): Promise<void> {
	mkdirSync(commentsDir(), { recursive: true });
	const path = fileFor(ref);
	const tmp = `${path}.${process.pid}.tmp`;
	await Bun.write(tmp, `${JSON.stringify(data, null, "\t")}\n`);
	renameSync(tmp, path);
}

export interface Identity {
	author: string;
	session?: string;
}

export async function addComment(
	ref: PrRef,
	input: {
		path: string;
		line: number;
		startLine?: number;
		side?: "old" | "new";
		body: string;
	},
	who: Identity,
): Promise<Comment> {
	const now = new Date().toISOString();
	const comment: Comment = {
		id: newId("c"),
		path: input.path,
		side: input.side ?? "new",
		line: input.line,
		...(input.startLine && input.startLine !== input.line ? { startLine: input.startLine } : {}),
		body: input.body,
		author: who.author,
		...(who.session ? { session: who.session } : {}),
		status: "open",
		createdAt: now,
		updatedAt: now,
		replies: [],
	};
	const data = await loadComments(ref);
	data.comments.push(comment);
	await saveComments(ref, data);
	return comment;
}

/** Every PR that has a comment file, with its open/resolved counts. */
export async function listPrs(): Promise<Array<{ ref: PrRef; url: string; open: number; resolved: number; updatedAt: string }>> {
	let names: string[] = [];
	try {
		names = readdirSync(commentsDir()).filter((n) => n.endsWith(".json"));
	} catch {
		return [];
	}
	const out = [];
	for (const name of names) {
		const m = /^(.+)__(.+)__(\d+)\.json$/.exec(name);
		if (!m) continue;
		const ref = { owner: m[1], repo: m[2], number: Number(m[3]) };
		const data = await loadComments(ref);
		const stamps = data.comments.map((c) => c.updatedAt).sort();
		out.push({
			ref,
			url: data.url,
			open: data.comments.filter((c) => c.status === "open").length,
			resolved: data.comments.filter((c) => c.status === "resolved").length,
			updatedAt: stamps[stamps.length - 1] ?? "",
		});
	}
	return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** A comment id names one comment across every PR file. */
export async function findComment(id: string): Promise<{ ref: PrRef; comment: Comment } | null> {
	for (const entry of await listPrs()) {
		const data = await loadComments(entry.ref);
		const comment = data.comments.find((c) => c.id === id);
		if (comment) return { ref: entry.ref, comment };
	}
	return null;
}

async function mutate(ref: PrRef, id: string, fn: (c: Comment) => void): Promise<Comment> {
	const data = await loadComments(ref);
	const comment = data.comments.find((c) => c.id === id);
	if (!comment) throw new Error(`no comment ${id} on ${prUrl(ref)}`);
	fn(comment);
	comment.updatedAt = new Date().toISOString();
	await saveComments(ref, data);
	return comment;
}

export function editComment(ref: PrRef, id: string, body: string): Promise<Comment> {
	return mutate(ref, id, (c) => {
		c.body = body;
	});
}

export function replyToComment(ref: PrRef, id: string, body: string, who: Identity): Promise<Comment> {
	const reply: Reply = {
		id: newId("r"),
		author: who.author,
		...(who.session ? { session: who.session } : {}),
		body,
		createdAt: new Date().toISOString(),
	};
	return mutate(ref, id, (c) => {
		c.replies.push(reply);
	});
}

export function resolveComment(ref: PrRef, id: string, who: Identity): Promise<Comment> {
	return mutate(ref, id, (c) => {
		c.status = "resolved";
		c.resolvedBy = who.author;
		c.resolvedAt = new Date().toISOString();
	});
}

export function reopenComment(ref: PrRef, id: string): Promise<Comment> {
	return mutate(ref, id, (c) => {
		c.status = "open";
		delete c.resolvedBy;
		delete c.resolvedAt;
	});
}
