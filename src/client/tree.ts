import type { DiffFile, DiffLine } from "../core/types";

export interface TreeDir {
	/** Display name; single-child directory chains compress into "a/b/c". */
	name: string;
	/** Full path prefix, the collapse key. */
	path: string;
	dirs: TreeDir[];
	files: DiffFile[];
}

export function buildTree(files: DiffFile[]): TreeDir {
	const root: TreeDir = { name: "", path: "", dirs: [], files: [] };
	for (const f of files) {
		const parts = f.path.split("/");
		let node = root;
		for (const part of parts.slice(0, -1)) {
			let next = node.dirs.find((d) => d.name === part);
			if (!next) {
				next = { name: part, path: node.path ? `${node.path}/${part}` : part, dirs: [], files: [] };
				node.dirs.push(next);
			}
			node = next;
		}
		node.files.push(f);
	}
	const compress = (dir: TreeDir): TreeDir => {
		while (dir.files.length === 0 && dir.dirs.length === 1) {
			const only = dir.dirs[0];
			dir = { ...only, name: dir.name ? `${dir.name}/${only.name}` : only.name };
		}
		dir.dirs = dir.dirs.map(compress);
		return dir;
	};
	root.dirs = root.dirs.map(compress);
	return root;
}

export interface SplitRow {
	left: DiffLine | null;
	right: DiffLine | null;
}

/**
 * Side-by-side pairing: a run of deletions lines up with the run of
 * additions that follows it, row by row; the longer run overflows into rows
 * with an empty other side. Context sits on both sides.
 */
export function pairLines(lines: DiffLine[]): SplitRow[] {
	const rows: SplitRow[] = [];
	let dels: DiffLine[] = [];
	let adds: DiffLine[] = [];
	const flush = () => {
		const n = Math.max(dels.length, adds.length);
		for (let i = 0; i < n; i++) rows.push({ left: dels[i] ?? null, right: adds[i] ?? null });
		dels = [];
		adds = [];
	};
	for (const l of lines) {
		if (l.type === "del") dels.push(l);
		else if (l.type === "add") adds.push(l);
		else {
			flush();
			rows.push({ left: l, right: l });
		}
	}
	flush();
	return rows;
}
