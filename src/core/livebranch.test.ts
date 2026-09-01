import { describe, expect, test } from "bun:test";
import { parseLiveBranchComment, supportsLiveBranch } from "./livebranch";

const READY = `<!-- lite-env-dev-pod -->
## Live Branch Dev Pod Ready

| | |
| --- | --- |
| **Environment** | \`d48776\` |
| **Pod** | \`lite-env-d48776\` |
| **Branch** | \`feat/thing\` |

<time datetime="2026-08-30T12:00:00Z">…</time>
`;

const DELETED = `<!-- lite-env-dev-pod -->
## Live Branch Dev Pod Deleted
`;

const FAILED = `<!-- lite-env-dev-pod -->
## Live Branch Deploy Failed
[View logs](https://github.com/x/y/actions/runs/1)
`;

describe("parseLiveBranchComment", () => {
	test("ready comment yields env urls", () => {
		const pod = parseLiveBranchComment(READY)!;
		expect(pod.state).toBe("ready");
		expect(pod.envName).toBe("d48776");
		expect(pod.url).toBe("https://live-d48776.env.canarytechnologies.com");
		expect(pod.adminUrl).toContain("/canary-admin/");
		expect(pod.gatewayUrl).toBe("https://live-gw-d48776.env.canarytechnologies.com");
		expect(pod.branch).toBe("feat/thing");
		expect(pod.updatedAt).toBe("2026-08-30T12:00:00Z");
	});
	test("deleted comment has no env", () => {
		const pod = parseLiveBranchComment(DELETED)!;
		expect(pod.state).toBe("deleted");
		expect(pod.envName).toBeNull();
		expect(pod.url).toBeNull();
	});
	test("failed comment carries the logs url", () => {
		expect(parseLiveBranchComment(FAILED)!.logsUrl).toContain("actions/runs/1");
	});
	test("other comments are not the status comment", () => {
		expect(parseLiveBranchComment("just words")).toBeNull();
		expect(parseLiveBranchComment("<!-- lite-env-dev-pod --> unknown heading")).toBeNull();
	});
});

describe("supportsLiveBranch", () => {
	test("canary only", () => {
		expect(supportsLiveBranch({ owner: "canary-technologies-corp", repo: "canary", number: 1 })).toBe(true);
		expect(supportsLiveBranch({ owner: "0x962", repo: "margin", number: 1 })).toBe(false);
	});
});
