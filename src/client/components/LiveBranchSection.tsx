import { useState } from "react";
import type { LiveBranchStatus } from "../../core/livebranch";
import { api, toast } from "../lib";

const STATE_WORD: Record<string, { word: string; cls: string }> = {
	ready: { word: "Ready", cls: "pass" },
	"deploy-failed": { word: "Deploy failed", cls: "fail" },
	deleted: { word: "Deleted", cls: "skip" },
};

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
		<>
			<div className="panel-label">Live Branch</div>
			<div className="lb">
				<div className="lb-row">
					{state ? (
						<span className="lb-state">
							<span className={`check-dot ${state.cls}`} />
							{state.word}
							{pod?.envName && <span className="dim"> · {pod.envName}</span>}
						</span>
					) : (
						<span className="lb-state dim">{status.enabled ? "label set · no status yet" : "not enabled"}</span>
					)}
				</div>
				{pod?.state === "ready" && (
					<div className="lb-links">
						{pod.url && (
							<a href={pod.url} target="_blank" rel="noreferrer">
								App
							</a>
						)}
						{pod.adminUrl && (
							<a href={pod.adminUrl} target="_blank" rel="noreferrer">
								Admin
							</a>
						)}
						{pod.gatewayUrl && (
							<a href={pod.gatewayUrl} target="_blank" rel="noreferrer">
								Gateway
							</a>
						)}
					</div>
				)}
				{pod?.logsUrl && pod.state === "deploy-failed" && (
					<div className="lb-links">
						<a href={pod.logsUrl} target="_blank" rel="noreferrer">
							View logs
						</a>
					</div>
				)}
				<div className="lb-actions">
					{(!status.enabled || !pod || pod.state === "deleted") && (
						<button type="button" className="btn sm" disabled={busy} onClick={() => void run("ensure")}>
							Enable
						</button>
					)}
					{pod && pod.state !== "deleted" && (
						<>
							<button type="button" className="btn ghost sm" disabled={busy} onClick={() => void run("deploy")}>
								Redeploy
							</button>
							<button type="button" className="btn ghost sm danger" disabled={busy} onClick={() => void run("delete")}>
								Delete
							</button>
						</>
					)}
				</div>
			</div>
		</>
	);
}
