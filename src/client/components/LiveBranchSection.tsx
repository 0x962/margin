import { Copy, ExternalLink, RefreshCw, Rocket, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LiveBranchStatus } from "../../core/livebranch";
import { api, timeAgo, toast } from "../lib";

const STATE_WORD: Record<string, { word: string; cls: string }> = {
	ready: { word: "Ready", cls: "pass" },
	"deploy-failed": { word: "Deploy failed", cls: "fail" },
	deleted: { word: "Deleted", cls: "skip" },
};

function UrlRow({ label, url }: { label: string; url: string }) {
	const bare = url.replace(/^https?:\/\//, "");
	return (
		<div className="lb-row">
			<span className="lb-label">{label}</span>
			<span className="lb-value mono">{bare}</span>
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

/** Canary's per-PR cloud environment, driven through its GitHub workflow. */
export function LiveBranchSection({
	pr,
	status,
	onChanged,
}: {
	pr: string;
	status: LiveBranchStatus | null;
	onChanged: () => void;
}) {
	const [busy, setBusy] = useState(false);
	if (!status?.supported) return null;
	const pod = status.pod;
	const state = pod ? (STATE_WORD[pod.state] ?? { word: pod.state, cls: "skip" }) : null;

	const run = async (op: "ensure" | "deploy" | "delete") => {
		setBusy(true);
		try {
			const r = await api.liveBranchOp(pr, op);
			toast(op === "ensure" ? `Live branch: ${r.action}` : `/${op}-live-branch posted`);
			onChanged();
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), "error");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="lb">
			<div className="lb-top">
				{state ? (
					<span className={`lb-state ${state.cls}`}>{state.word}</span>
				) : (
					<span className="lb-state skip">{status.enabled ? "Provisioning" : "Not enabled"}</span>
				)}
				{pod?.envName && <span className="lb-env mono">{pod.envName}</span>}
				<span className="spacer" />
				<button type="button" className="btn ghost icon" title="Refresh" onClick={onChanged}>
					<RefreshCw size={13} />
				</button>
			</div>

			{pod?.state === "ready" && (
				<div className="lb-urls">
					{pod.url && <UrlRow label="App" url={pod.url} />}
					{pod.adminUrl && <UrlRow label="Django admin" url={pod.adminUrl} />}
					{pod.gatewayUrl && <UrlRow label="PMS gateway" url={pod.gatewayUrl} />}
				</div>
			)}
			{pod?.state === "deploy-failed" && pod.logsUrl && (
				<div className="lb-urls">
					<UrlRow label="Logs" url={pod.logsUrl} />
				</div>
			)}

			{pod && (
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
			)}

			<div className="lb-actions">
				{pod?.state === "ready" && pod.url && (
					<a className="btn light" href={pod.url} target="_blank" rel="noreferrer">
						<ExternalLink size={13} /> Open app
					</a>
				)}
				{(!status.enabled || !pod || pod.state === "deleted") && (
					<button type="button" className="btn light" disabled={busy} onClick={() => void run("ensure")}>
						<Rocket size={13} /> Enable
					</button>
				)}
				{pod && pod.state !== "deleted" && (
					<>
						<button type="button" className="btn" disabled={busy} onClick={() => void run("deploy")}>
							<Rocket size={13} /> Redeploy
						</button>
						<button type="button" className="btn" disabled={busy} onClick={() => void run("delete")}>
							<Trash2 size={13} /> Delete pod
						</button>
					</>
				)}
			</div>

			<p className="lb-note">
				Every push to the branch redeploys the pod. Closing or merging the pull request deletes the pod.
			</p>
		</div>
	);
}
