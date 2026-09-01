import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addComment,
	findComment,
	listComments,
	listPrs,
	reopenComment,
	replyToComment,
	resolveComment,
} from "./store";

const ref = { owner: "acme", repo: "web", number: 9 };
let home = "";

beforeAll(() => {
	home = mkdtempSync(join(tmpdir(), "margin-test-"));
	process.env.MARGIN_HOME = home;
});
afterAll(() => {
	rmSync(home, { recursive: true, force: true });
});

describe("store", () => {
	test("add carries identity and anchors", async () => {
		const c = await addComment(
			ref,
			{ path: "src/x.ts", line: 12, startLine: 10, body: "tighten this" },
			{ author: "backend-checker", session: "sess-123" },
		);
		expect(c.id).toStartWith("c-");
		expect(c.author).toBe("backend-checker");
		expect(c.session).toBe("sess-123");
		expect(c.startLine).toBe(10);
		expect(c.status).toBe("open");
	});

	test("list, find across PRs, reply, resolve, reopen", async () => {
		const [c] = await listComments(ref);
		const hit = await findComment(c.id);
		expect(hit?.ref).toEqual(ref);

		await replyToComment(ref, c.id, "done", { author: "navid" });
		const resolved = await resolveComment(ref, c.id, { author: "navid" });
		expect(resolved.status).toBe("resolved");
		expect(resolved.resolvedBy).toBe("navid");
		expect(resolved.replies[0].author).toBe("navid");
		expect(resolved.replies[0].session).toBeUndefined();

		const reopened = await reopenComment(ref, c.id);
		expect(reopened.status).toBe("open");
		expect(reopened.resolvedBy).toBeUndefined();
	});

	test("prs listing counts", async () => {
		const prs = await listPrs();
		expect(prs.length).toBe(1);
		expect(prs[0].open).toBe(1);
		expect(prs[0].url).toBe("https://github.com/acme/web/pull/9");
	});

	test("startLine equal to line is dropped", async () => {
		const c = await addComment(ref, { path: "a", line: 5, startLine: 5, body: "x" }, { author: "a" });
		expect(c.startLine).toBeUndefined();
	});
});
