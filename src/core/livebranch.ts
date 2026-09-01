import { gh } from "./pr";
import { prUrl } from "./store";
import type { PrRef } from "./types";

/**
 * A live branch is Canary's per-pull-request cloud environment: one
 * Kubernetes pod running the whole Canary stack at
 * `https://live-<env>.env.canarytechnologies.com`. The canary repository's
 * "Live Branch: Dev Pod" GitHub workflow owns the pod; margin never talks to
 * the cluster, it only drives the workflow's GitHub triggers:
 *
 * - The `Live Branch: Enabled` label creates a pod and redeploys it on every
 *   push to the branch.
 * - The comments `/create-live-branch`, `/deploy-live-branch` and
 *   `/delete-live-branch` run those actions once.
 * - The workflow reports through one comment it keeps updating, marked with
 *   `<!-- lite-env-dev-pod -->`; that comment is the only place the pod's
 *   name and state are published, so this module parses it.
 *
 * The workflow ignores branches whose name starts with `golem/`: the Golem
 * agent claims its own pod for those.
 */

export const LIVE_BRANCH_REPO = "canary-technologies-corp/canary";

const ENABLED_LABEL = "Live Branch: Enabled";
/** The label names mid-rename: the workflow accepts both spellings. */
const ENABLED_LABELS = [ENABLED_LABEL, "Lite Env: Enabled"];
const PERSIST_LABELS = ["Live Branch: Persist", "Lite Env: Persist"];
const COMMENT_MARKER = "<!-- lite-env-dev-pod -->";

export type LiveBranchPodState = "ready" | "deploy-failed" | "deleted";

export interface LiveBranchPod {
	state: LiveBranchPodState;
	envName: string | null;
	url: string | null;
	adminUrl: string | null;
	gatewayUrl: string | null;
	podName: string | null;
	branch: string | null;
	logsUrl: string | null;
	updatedAt: string | null;
}

export interface LiveBranchStatus {
	supported: boolean;
	enabled: boolean;
	persist: boolean;
	pod: LiveBranchPod | null;
}

const STATE_BY_HEADING: Array<[string, LiveBranchPodState]> = [
	["Live Branch Dev Pod Ready", "ready"],
	["Live Branch Deploy Failed", "deploy-failed"],
	["Live Branch Dev Pod Deleted", "deleted"],
];

/** Reads the workflow's status comment; null when the body is not that comment. */
export function parseLiveBranchComment(body: string): LiveBranchPod | null {
	if (!body.includes(COMMENT_MARKER)) return null;
	const state = STATE_BY_HEADING.find(([heading]) => body.includes(heading))?.[1];
	if (!state) return null;

	const cell = (label: string) =>
		new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*\`([^\`]+)\`\\s*\\|`).exec(body)?.[1] ?? null;
	const envName = cell("Environment");
	const podName = cell("Pod");
	const branch = cell("Branch");
	const logsUrl = /\[View logs\]\(([^)]+)\)/.exec(body)?.[1] ?? null;
	const updatedAt = /datetime="([^"]+)"/.exec(body)?.[1] ?? null;

	if (!envName) {
		return { state, envName: null, url: null, adminUrl: null, gatewayUrl: null, podName, branch, logsUrl, updatedAt };
	}
	const url = `https://live-${envName}.env.canarytechnologies.com`;
	return {
		state,
		envName,
		url,
		adminUrl: `${url}/canary-admin/`,
		gatewayUrl: `https://live-gw-${envName}.env.canarytechnologies.com`,
		podName,
		branch,
		logsUrl,
		updatedAt,
	};
}

export function supportsLiveBranch(ref: PrRef): boolean {
	return `${ref.owner}/${ref.repo}` === LIVE_BRANCH_REPO;
}

async function issueApi<T>(ref: PrRef, tail: string): Promise<T> {
	return JSON.parse(
		await gh(["api", `repos/${ref.owner}/${ref.repo}/issues/${ref.number}/${tail}`, "--paginate"]),
	) as T;
}

async function latestPodComment(ref: PrRef): Promise<LiveBranchPod | null> {
	const comments = await issueApi<Array<{ body?: string }>>(ref, "comments?per_page=100");
	return (
		comments
			.map((c) => parseLiveBranchComment(c.body ?? ""))
			.filter((p): p is LiveBranchPod => p !== null)
			.at(-1) ?? null
	);
}

export async function getLiveBranch(ref: PrRef): Promise<LiveBranchStatus> {
	if (!supportsLiveBranch(ref)) return { supported: false, enabled: false, persist: false, pod: null };
	const [labels, pod] = await Promise.all([
		issueApi<Array<{ name: string }>>(ref, "labels?per_page=100"),
		latestPodComment(ref),
	]);
	const names = labels.map((l) => l.name);
	return {
		supported: true,
		enabled: ENABLED_LABELS.some((n) => names.includes(n)),
		persist: PERSIST_LABELS.some((n) => names.includes(n)),
		pod,
	};
}

/**
 * Gives the pull request a live branch when it has none. The label is the
 * durable switch: it creates the pod now and redeploys on every push. When
 * the label is already set but the status comment says the pod was deleted,
 * only the one-shot comment command brings it back — re-adding a label that
 * is already set fires no GitHub event.
 */
export async function ensureLiveBranch(
	ref: PrRef,
): Promise<{ action: "labeled" | "recreated" | "already" | "skipped"; reason?: string }> {
	if (!supportsLiveBranch(ref)) return { action: "skipped", reason: "repository" };
	const pr = JSON.parse(await gh(["pr", "view", prUrl(ref), "--json", "state,headRefName,labels"])) as {
		state: string;
		headRefName: string;
		labels: Array<{ name: string }>;
	};
	if (pr.state.toLowerCase() !== "open") return { action: "skipped", reason: "closed" };
	if (pr.headRefName.startsWith("golem/")) return { action: "skipped", reason: "golem-branch" };

	const names = pr.labels.map((l) => l.name);
	if (!ENABLED_LABELS.some((n) => names.includes(n))) {
		await gh(["pr", "edit", prUrl(ref), "--add-label", ENABLED_LABEL]);
		return { action: "labeled" };
	}
	const pod = await latestPodComment(ref);
	if (!pod || pod.state === "deleted") {
		await gh(["pr", "comment", prUrl(ref), "--body", "/create-live-branch"]);
		return { action: "recreated" };
	}
	return { action: "already" };
}

/** Posts one of the workflow's slash commands as a pull request comment. */
export async function liveBranchCommand(ref: PrRef, command: "create" | "deploy" | "delete"): Promise<void> {
	await gh(["pr", "comment", prUrl(ref), "--body", `/${command}-live-branch`]);
}
