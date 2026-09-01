import type { DiffFile, DiffHunk, DiffLine, PrMeta, PrRef } from "./types";
import { prUrl } from "./store";

/**
 * A PR can be named by its full GitHub URL, with or without the scheme, or
 * by the short forms owner/repo#123 and owner/repo/123.
 */
export function parsePrRef(input: string): PrRef | null {
	const s = decodeURIComponent(input.trim()).replace(/^\/+/, "").replace(/\/+$/, "");
	let m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(s);
	if (m) return { owner: m[1], repo: m[2], number: Number(m[3]) };
	m = /^([\w.-]+)\/([\w.-]+)[#/](\d+)$/.exec(s);
	if (m) return { owner: m[1], repo: m[2], number: Number(m[3]) };
	return null;
}

async function gh(args: string[]): Promise<string> {
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
		"title,state,isDraft,author,headRefName,baseRefName,additions,deletions,changedFiles",
	]);
	const d = JSON.parse(raw) as Omit<PrMeta, "author"> & { author: { login: string } };
	return { ...d, author: d.author?.login ?? "" };
}

export async function fetchDiff(ref: PrRef): Promise<DiffFile[]> {
	return parseDiff(await gh(["pr", "diff", prUrl(ref)]));
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
