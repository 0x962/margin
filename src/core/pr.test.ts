import { describe, expect, test } from "bun:test";
import { parseDiff, parsePrRef } from "./pr";

describe("parsePrRef", () => {
	test("full URL, scheme optional, path noise tolerated", () => {
		expect(parsePrRef("https://github.com/o/r/pull/12")).toEqual({ owner: "o", repo: "r", number: 12 });
		expect(parsePrRef("github.com/o/r/pull/12/files")).toEqual({ owner: "o", repo: "r", number: 12 });
		expect(parsePrRef("/https://github.com/o/r/pull/12")).toEqual({ owner: "o", repo: "r", number: 12 });
	});
	test("short forms", () => {
		expect(parsePrRef("o/r#7")).toEqual({ owner: "o", repo: "r", number: 7 });
		expect(parsePrRef("o/r/7")).toEqual({ owner: "o", repo: "r", number: 7 });
	});
	test("garbage is null", () => {
		expect(parsePrRef("not a pr")).toBeNull();
		expect(parsePrRef("https://github.com/o/r/issues/5")).toBeNull();
	});
});

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,5 @@ header text
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
@@ -20,2 +21,2 @@
 x
 y
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
\\ No newline at end of file
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
`;

describe("parseDiff", () => {
	const files = parseDiff(SAMPLE);

	test("files, statuses, counts", () => {
		expect(files.length).toBe(3);
		expect(files[0].path).toBe("src/a.ts");
		expect(files[0].status).toBe("modified");
		expect(files[0].additions).toBe(2);
		expect(files[0].deletions).toBe(1);
		expect(files[1].status).toBe("added");
		expect(files[2].binary).toBe(true);
	});

	test("line numbers advance per side", () => {
		const lines = files[0].hunks[0].lines;
		expect(lines[0]).toMatchObject({ type: "context", old: 1, new: 1 });
		expect(lines[1]).toMatchObject({ type: "del", old: 2, new: null });
		expect(lines[2]).toMatchObject({ type: "add", old: null, new: 2 });
		expect(lines[3]).toMatchObject({ type: "add", old: null, new: 3 });
		expect(lines[4]).toMatchObject({ type: "context", old: 3, new: 4 });
	});

	test("hunk header text and range survive", () => {
		expect(files[0].hunks[0].header).toBe("header text");
		expect(files[0].hunks[0].range).toBe("-1,4 +1,5");
	});

	test("no-newline marker is not a line", () => {
		expect(files[1].hunks[0].lines.length).toBe(2);
	});
});
