import type { CheckRun, DiffFile, DiffHunk, DiffLine, PrMeta, PrRef } from "./types";
import { prUrl } from "./store";

/**
 * A PR can be named by its full GitHub URL, with or without the scheme, by
 * the short forms owner/repo#123 and owner/repo/123, or by any URL that
 * carries the GitHub URL inside it — a margin review link
 * (http://margin.localhost/https://github.com/...) names the same PR.
 */
export function parsePrRef(input: string): PrRef | null {
	const s = decodeURIComponent(input.trim()).replace(/^\/+/, "").replace(/\/+$/, "");
	let m = /(?:^|\/)github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(s);
	if (m) return { owner: m[1], repo: m[2], number: Number(m[3]) };
	m = /^([\w.-]+)\/([\w.-]+)[#/](\d+)$/.exec(s);
	if (m) return { owner: m[1], repo: m[2], number: Number(m[3]) };
	return null;
}

export async function gh(args: string[]): Promise<string> {
	const proc = Bun.spawn({ cmd: ["gh", ...args], stdout: "pipe", stderr: "pipe" });
	const [out, err] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if ((await proc.exited) !== 0) throw new Error(err.trim() || `gh ${args[0]} failed`);
	return out;
}

export async function fetchMeta(ref: PrRef): Promise<PrMeta> {
	const raw = await gh([
		"pr",
		"view",
		prUrl(ref),
		"--json",
		"title,state,isDraft,author,headRefName,baseRefName,additions,deletions,changedFiles,mergeable",
	]);
	const d = JSON.parse(raw) as Omit<PrMeta, "author"> & { author: { login: string } };
	return { ...d, author: d.author?.login ?? "" };
}

export async function fetchDiff(ref: PrRef): Promise<DiffFile[]> {
	return parseDiff(await gh(["pr", "diff", prUrl(ref)]));
}

/**
 * `gh pr checks` exits non-zero while any check is pending or failing; the
 * JSON on stdout is still the answer, so the exit code is ignored when the
 * output parses.
 */
export async function fetchChecks(ref: PrRef): Promise<CheckRun[]> {
	const proc = Bun.spawn({
		cmd: ["gh", "pr", "checks", prUrl(ref), "--json", "name,workflow,bucket,link"],
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	await proc.exited;
	try {
		return JSON.parse(out) as CheckRun[];
	} catch {
		// A PR with no checks configured prints a plain sentence instead.
		if (/no checks/i.test(out + err)) return [];
		throw new Error(err.trim() || "gh pr checks failed");
	}
}

export type PrAction =
	| "approve"
	| "merge"
	| "admin-merge"
	| "automerge"
	| "ready"
	| "update-branch";

export async function runPrAction(ref: PrRef, action: PrAction): Promise<void> {
	const url = prUrl(ref);
	if (action === "approve") await gh(["pr", "review", url, "--approve"]);
	else if (action === "merge") await gh(["pr", "merge", url, "--squash"]);
	// Bypasses branch protection; only an admin on the repository may do it.
	else if (action === "admin-merge") await gh(["pr", "merge", url, "--squash", "--admin"]);
	else if (action === "automerge") await gh(["pr", "merge", url, "--squash", "--auto"]);
	else if (action === "ready") await gh(["pr", "ready", url]);
	else await gh(["pr", "update-branch", url]);
}

/**
 * Canary's deploy-on-merge switch is the `00_AUTO_DEPLOY` label. A repository
 * without that label has no such workflow, and the merge menu leaves the item
 * out.
 */
const AUTO_DEPLOY_LABEL = "00_AUTO_DEPLOY";

export async function getAutoDeploy(
	ref: PrRef,
): Promise<{ available: boolean; enabled: boolean }> {
	// `gh label list --search` matches substrings; the exact name is compared.
	const [repoLabels, pr] = await Promise.all([
		gh([
			"label",
			"list",
			"-R",
			`${ref.owner}/${ref.repo}`,
			"--search",
			AUTO_DEPLOY_LABEL,
			"--limit",
			"20",
			"--json",
			"name",
		]).then((raw) => JSON.parse(raw) as Array<{ name: string }>),
		gh(["pr", "view", prUrl(ref), "--json", "labels"]).then(
			(raw) => JSON.parse(raw) as { labels: Array<{ name: string }> },
		),
	]);
	return {
		available: repoLabels.some((l) => l.name === AUTO_DEPLOY_LABEL),
		enabled: pr.labels.some((l) => l.name === AUTO_DEPLOY_LABEL),
	};
}

export async function setAutoDeploy(ref: PrRef, enabled: boolean): Promise<void> {
	await gh([
		"pr",
		"edit",
		prUrl(ref),
		enabled ? "--add-label" : "--remove-label",
		AUTO_DEPLOY_LABEL,
	]);
}

export interface ConversationEntry {
	author: string;
	createdAt: string;
	body: string;
	/** A review verdict (APPROVED, CHANGES_REQUESTED, COMMENTED); empty for a plain comment. */
	verdict?: string;
}

/** The PR's description and its GitHub conversation, oldest first. */
export async function fetchConversation(
	ref: PrRef,
): Promise<{ body: string; entries: ConversationEntry[] }> {
	const raw = await gh(["pr", "view", prUrl(ref), "--json", "body,comments,reviews"]);
	const d = JSON.parse(raw) as {
		body: string;
		comments: Array<{ author: { login: string }; createdAt: string; body: string }>;
		reviews: Array<{ author: { login: string }; submittedAt: string; body: string; state: string }>;
	};
	const entries: ConversationEntry[] = [
		...d.comments.map((c) => ({
			author: c.author?.login ?? "",
			createdAt: c.createdAt,
			body: c.body,
		})),
		...d.reviews
			.filter((r) => r.body?.trim() || r.state !== "COMMENTED")
			.map((r) => ({
				author: r.author?.login ?? "",
				createdAt: r.submittedAt,
				body: r.body ?? "",
				verdict: r.state,
			})),
	].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return { body: d.body, entries };
}

/** `git diff` quotes a path with special characters; strip the a/ or b/ prefix either way. */
function stripPrefix(p: string): string {
	const unquoted = p.startsWith('"') ? (JSON.parse(p) as string) : p;
	return unquoted.replace(/^[ab]\//, "");
}

export function parseDiff(text: string): DiffFile[] {
	const files: DiffFile[] = [];
	let file: DiffFile | null = null;
	let hunk: DiffHunk | null = null;
	let oldN = 0;
	let newN = 0;

	for (const line of text.split("\n")) {
		const head = /^diff --git (.+) (.+)$/.exec(line);
		if (head) {
			file = {
				path: stripPrefix(head[2]),
				oldPath: stripPrefix(head[1]),
				status: "modified",
				binary: false,
				additions: 0,
				deletions: 0,
				hunks: [],
			};
			files.push(file);
			hunk = null;
			continue;
		}
		if (!file) continue;
		if (line.startsWith("new file mode")) file.status = "added";
		else if (line.startsWith("deleted file mode")) file.status = "deleted";
		else if (line.startsWith("rename from")) file.status = "renamed";
		else if (line.startsWith("rename to")) file.path = stripPrefix(`b/${line.slice("rename to ".length)}`);
		else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) file.binary = true;

		const at = /^@@ (-\d+(?:,\d+)?) (\+\d+(?:,\d+)?) @@ ?(.*)$/.exec(line);
		if (at) {
			oldN = Number.parseInt(at[1].slice(1), 10);
			newN = Number.parseInt(at[2].slice(1), 10);
			hunk = { range: `${at[1]} ${at[2]}`, header: at[3], lines: [] };
			file.hunks.push(hunk);
			continue;
		}
		if (!hunk) continue;
		if (line.startsWith("\\")) continue; // "\ No newline at end of file"
		let dl: DiffLine | null = null;
		if (line.startsWith("+")) {
			dl = { type: "add", old: null, new: newN++, text: line.slice(1) };
			file.additions++;
		} else if (line.startsWith("-")) {
			dl = { type: "del", old: oldN++, new: null, text: line.slice(1) };
			file.deletions++;
		} else if (line.startsWith(" ") || line === "") {
			dl = { type: "context", old: oldN++, new: newN++, text: line.slice(1) };
		}
		if (dl) hunk.lines.push(dl);
	}
	return files;
}
