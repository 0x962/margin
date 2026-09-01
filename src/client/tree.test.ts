import { describe, expect, test } from "bun:test";
import type { DiffFile, DiffLine } from "../core/types";
import { buildTree, pairLines } from "./tree";

const file = (path: string): DiffFile => ({
	path,
	oldPath: path,
	status: "modified",
	binary: false,
	additions: 0,
	deletions: 0,
	hunks: [],
});

describe("buildTree", () => {
	test("nests by directory and compresses single-child chains", () => {
		const t = buildTree([file("a/b/c/x.ts"), file("a/b/c/y.ts"), file("a/b/z.ts"), file("top.ts")]);
		expect(t.files.map((f) => f.path)).toEqual(["top.ts"]);
		expect(t.dirs.length).toBe(1);
		expect(t.dirs[0].name).toBe("a/b");
		expect(t.dirs[0].files.map((f) => f.path)).toEqual(["a/b/z.ts"]);
		expect(t.dirs[0].dirs[0].name).toBe("c");
		expect(t.dirs[0].dirs[0].files.length).toBe(2);
	});
});

const L = (type: DiffLine["type"], old: number | null, n: number | null): DiffLine => ({
	type,
	old,
	new: n,
	text: "",
});

describe("pairLines", () => {
	test("del run pairs with the add run after it", () => {
		const rows = pairLines([
			L("context", 1, 1),
			L("del", 2, null),
			L("del", 3, null),
			L("add", null, 2),
			L("context", 4, 3),
		]);
		expect(rows.length).toBe(4);
		expect(rows[1]).toEqual({ left: L("del", 2, null), right: L("add", null, 2) });
		expect(rows[2]).toEqual({ left: L("del", 3, null), right: null });
		expect(rows[3].left).toEqual(rows[3].right);
	});
});
