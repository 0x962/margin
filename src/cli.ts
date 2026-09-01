#!/usr/bin/env bun
import { parsePrRef } from "./core/pr";
import {
	addComment,
	editComment,
	findComment,
	listComments,
	listPrs,
	prUrl,
	reopenComment,
	replyToComment,
	resolveComment,
	type Identity,
} from "./core/store";
import type { Comment, PrRef } from "./core/types";

function usage(): never {
	console.log(`margin — local review comments on GitHub PRs, for humans and agents

  margin open <pr>                                  print the local review URL
  margin list <pr> [--all]                          open comments (--all adds resolved)
  margin add <pr> --path <file> --line <n> --body <text>
             [--start-line <n>] [--side new|old] [--author <name>] [--session <id>]
  margin reply <comment-id> --body <text> [--author <name>] [--session <id>]
  margin edit <comment-id> --body <text>
  margin resolve <comment-id> [--author <name>]
  margin reopen <comment-id>
  margin prs                                        every PR with local comments

<pr> is a GitHub PR URL or owner/repo#123. --body - reads the body from stdin.
The author defaults to $MARGIN_AUTHOR, then git config user.name. An agent
passes --author with its own name and --session with its session id
(default: $CLAUDE_SESSION_ID), so every comment points back to the session
that wrote it. Output is JSON when stdout is not a terminal.`);
	process.exit(1);
}

function flags(argv: string[]): { pos: string[]; opt: Record<string, string> } {
	const pos: string[] = [];
	const opt: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--")) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("--")) {
				opt[key] = next;
				i++;
			} else {
				opt[key] = "true";
			}
		} else {
			pos.push(a);
		}
	}
	return { pos, opt };
}

async function identity(opt: Record<string, string>): Promise<Identity> {
	let author = opt.author ?? process.env.MARGIN_AUTHOR;
	if (!author) {
		const proc = Bun.spawn({ cmd: ["git", "config", "user.name"], stdout: "pipe", stderr: "ignore" });
		const out = (await new Response(proc.stdout).text()).trim();
		if ((await proc.exited) === 0 && out) author = out;
	}
	if (!author) throw new Error("no author: pass --author <name> or set MARGIN_AUTHOR");
	const session = opt.session ?? process.env.CLAUDE_SESSION_ID;
	return { author, ...(session ? { session } : {}) };
}

async function bodyOf(opt: Record<string, string>): Promise<string> {
	let body = opt.body;
	if (body === "-") body = await new Response(Bun.stdin.stream()).text();
	if (!body?.trim()) throw new Error("--body is required (use --body - to read stdin)");
	return body.trim();
}

function refOf(input: string | undefined): PrRef {
	const ref = input ? parsePrRef(input) : null;
	if (!ref) throw new Error(`not a PR: ${input ?? "(missing)"} — use a GitHub PR URL or owner/repo#123`);
	return ref;
}

const pretty = process.stdout.isTTY;

function printComment(c: Comment): void {
	if (!pretty) return;
	const anchor = c.startLine ? `${c.startLine}-${c.line}` : `${c.line}`;
	const who = c.session ? `${c.author} · ${c.session.slice(0, 8)}` : c.author;
	console.log(`${c.status === "open" ? "○" : "●"} ${c.id}  ${c.path}:${anchor}  [${who}]`);
	console.log(`  ${c.body.split("\n").join("\n  ")}`);
	for (const r of c.replies) {
		console.log(`  ↳ ${r.author}: ${r.body.split("\n").join("\n    ")}`);
	}
}

function emit(value: unknown): void {
	if (!pretty) console.log(JSON.stringify(value, null, 2));
}

async function locate(id: string | undefined) {
	if (!id) usage();
	const hit = await findComment(id);
	if (!hit) throw new Error(`no comment ${id}`);
	return hit;
}

const PORT = Number(process.env.MARGIN_PORT ?? 4519);
const argv = process.argv.slice(2);
const cmd = argv[0];
const { pos, opt } = flags(argv.slice(1));

try {
	switch (cmd) {
		case "open": {
			const ref = refOf(pos[0]);
			console.log(`http://localhost:${PORT}/${prUrl(ref)}`);
			break;
		}
		case "list": {
			const ref = refOf(pos[0]);
			const all = opt.all === "true";
			const comments = (await listComments(ref)).filter((c) => all || c.status === "open");
			emit(comments);
			for (const c of comments) printComment(c);
			if (pretty && comments.length === 0) console.log("no comments");
			break;
		}
		case "add": {
			const ref = refOf(pos[0]);
			if (!opt.path || !opt.line) throw new Error("--path and --line are required");
			const c = await addComment(
				ref,
				{
					path: opt.path,
					line: Number(opt.line),
					...(opt["start-line"] ? { startLine: Number(opt["start-line"]) } : {}),
					...(opt.side === "old" ? { side: "old" as const } : {}),
					body: await bodyOf(opt),
				},
				await identity(opt),
			);
			emit(c);
			printComment(c);
			break;
		}
		case "reply": {
			const { ref, comment } = await locate(pos[0]);
			const c = await replyToComment(ref, comment.id, await bodyOf(opt), await identity(opt));
			emit(c);
			printComment(c);
			break;
		}
		case "edit": {
			const { ref, comment } = await locate(pos[0]);
			const c = await editComment(ref, comment.id, await bodyOf(opt));
			emit(c);
			printComment(c);
			break;
		}
		case "resolve": {
			const { ref, comment } = await locate(pos[0]);
			const c = await resolveComment(ref, comment.id, await identity(opt));
			emit(c);
			printComment(c);
			break;
		}
		case "reopen": {
			const { ref, comment } = await locate(pos[0]);
			const c = await reopenComment(ref, comment.id);
			emit(c);
			printComment(c);
			break;
		}
		case "prs": {
			const prs = await listPrs();
			emit(prs);
			for (const p of prs) {
				if (pretty) console.log(`${p.url}  ${p.open} open · ${p.resolved} resolved`);
			}
			break;
		}
		default:
			usage();
	}
} catch (error) {
	console.error(`margin: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
