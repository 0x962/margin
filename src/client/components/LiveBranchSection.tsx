import {
	Copy,
	ExternalLink,
	LoaderCircle,
	RefreshCw,
	Rocket,
	Trash2,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import type { LiveBranchStatus } from "../../core/livebranch";
import { api, timeAgo, toast } from "../lib";

/** Every run of the workflow that creates, deploys, and deletes the pods. */
const WORKFLOW_RUNS_URL =
	"https://github.com/canary-technologies-corp/canary/actions/workflows/live-branch-dev.yml";

/**
 * One word for what the live branch is doing right now, derived from the
 * enable label and the workflow's status comment: no label means nothing was
 * ever created; a label with no status comment yet means the pod claim is
 * still running; otherwise the comment says.
 */
type Word = "none" | "creating" | "ready" | "deploy-failed" | "deleted";

function wordOf(status: LiveBranchStatus): Word {
	if (status.pod) return status.pod.state;
	return status.enabled ? "creating" : "none";
}

const PILL: Record<Word, { label: string; cls: string }> = {
	none: { label: "No live branch", cls: "skip" },
	creating: { label: "Creating", cls: "info" },
	ready: { label: "Ready", cls: "pass" },
	"deploy-failed": { label: "Deploy failed", cls: "warn" },
	deleted: { label: "Deleted", cls: "skip" },
};

function UrlRow({ label, url }: { label: string; url: string }) {
	const bare = url.replace(/^https?:\/\//, "");
	return (
		<div className="lb-row">
			<span className="lb-label">{label}</span>
			<a className="lb-value mono" href={url} target="_blank" rel="noreferrer" title={`Open ${url}`}>
				{bare}
			</a>
			<a className="btn ghost icon xs" href={url} target="_blank" rel="noreferrer" title={`Open ${label}`}>
				<ExternalLink size={13} />
			</a>
			<button
				type="button"
				className="btn ghost icon xs"
				title="Copy URL"
				onClick={() => {
					void navigator.clipboard.writeText(url);
					toast("Copied");
				}}
			>
				<Copy size={13} />
			</button>
		</div>
	);
}

/**
 * The pull request's live branch: Canary's per-PR cloud environment, one pod
 * running the whole stack on a public URL. The canary repository's "Live
 * Branch: Dev Pod" workflow owns the pod; this panel reads the workflow's
 * status comment and posts its label and slash-command triggers. Nothing
 * here talks to the cluster.
 */
export function LiveBranchSection({
	pr,
	status,
	onChanged,
}: {
	pr: string;
	status: LiveBranchStatus | null;
	onChanged: () => void;
}) {
	const [busy, setBusy] = useState<string | null>(null);
	if (!status?.supported) return null;
	const pod = status.pod;
	const word = wordOf(status);
	const pill = PILL[word];

	const run = async (op: "ensure" | "deploy" | "delete") => {
		setBusy(op);
		try {
			const r = await api.liveBranchOp(pr, op);
			toast(op === "ensure" ? `Live branch: ${r.action ?? "requested"}` : `/${op}-live-branch posted`);
			onChanged();
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), "error");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="lb">
			<div className="lb-top">
				<span className={`lb-state ${pill.cls}`}>{pill.label}</span>
				{pod?.envName && <span className="lb-env mono">{pod.envName}</span>}
				<span className="spacer" />
				<button type="button" className="btn ghost icon" title="Refresh" onClick={onChanged}>
					<RefreshCw size={13} />
				</button>
			</div>

			{word === "creating" && (
				<div className="lb-card">
					<LoaderCircle size={15} className="spin lb-card-ico info" />
					<div className="lb-card-body">
						<span>Claiming a pod for this pull request.</span>
						<span className="dim2">
							A warm pod is ready in about 15 seconds; a cold build takes a few minutes. The workflow
							posts its status here when the pod is up.
						</span>
						<a className="lb-text-link" href={WORKFLOW_RUNS_URL} target="_blank" rel="noreferrer">
							View workflow runs <ExternalLink size={11} />
						</a>
					</div>
				</div>
			)}

			{word === "deploy-failed" && (
				<div className="lb-card warn">
					<TriangleAlert size={15} className="lb-card-ico warn" />
					<div className="lb-card-body">
						<span>The last deploy failed.</span>
						<span className="dim2">The pod still runs the code from before the push.</span>
						{pod?.logsUrl && (
							<a className="lb-text-link" href={pod.logsUrl} target="_blank" rel="noreferrer">
								View the failed run <ExternalLink size={11} />
							</a>
						)}
					</div>
				</div>
			)}

			{(word === "none" || word === "deleted") && (
				<div className="lb-card">
					<div className="lb-card-body">
						<span className="dim2">
							{word === "deleted" ? "The pod was deleted." : "This pull request has no live branch."}
						</span>
						<div>
							<button
								type="button"
								className="btn light"
								disabled={busy !== null}
								onClick={() => void run("ensure")}
							>
								{busy === "ensure" ? <LoaderCircle size={13} className="spin" /> : <Rocket size={13} />}{" "}
								Create live branch
							</button>
						</div>
					</div>
				</div>
			)}

			{(word === "ready" || word === "deploy-failed") && pod?.url && (
				<>
					<div className="lb-urls">
						<UrlRow label="App" url={pod.url} />
						{pod.adminUrl && <UrlRow label="Django admin" url={pod.adminUrl} />}
						{pod.gatewayUrl && <UrlRow label="PMS gateway" url={pod.gatewayUrl} />}
					</div>

					<div className="lb-meta">
						{pod.podName && (
							<div className="lb-meta-row">
								<span className="lb-label">Pod</span>
								<span className="mono">{pod.podName}</span>
							</div>
						)}
						{pod.branch && (
							<div className="lb-meta-row">
								<span className="lb-label">Deployed ref</span>
								<span className="mono">{pod.branch}</span>
							</div>
						)}
						{pod.updatedAt && (
							<div className="lb-meta-row">
								<span className="lb-label">Updated</span>
								<span>{timeAgo(pod.updatedAt)} ago</span>
							</div>
						)}
					</div>

					<div className="lb-actions">
						<a className="btn light" href={pod.url} target="_blank" rel="noreferrer">
							<ExternalLink size={13} /> Open app
						</a>
						<button type="button" className="btn" disabled={busy !== null} onClick={() => void run("deploy")}>
							{busy === "deploy" ? <LoaderCircle size={13} className="spin" /> : <Rocket size={13} />}{" "}
							Redeploy
						</button>
						<button type="button" className="btn" disabled={busy !== null} onClick={() => void run("delete")}>
							<Trash2 size={13} /> Delete pod
						</button>
					</div>
				</>
			)}

			<p className="lb-note">
				Every push to the branch redeploys the pod.{" "}
				{status.persist
					? "The Persist label keeps the pod when the pull request closes."
					: "Closing or merging the pull request deletes the pod."}
			</p>
		</div>
	);
}
