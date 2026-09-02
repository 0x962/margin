import {
	Check,
	ChevronDown,
	Clock,
	GitMerge,
	LoaderCircle,
	Square,
	SquareCheck,
} from "lucide-react";
import { useState } from "react";
import type { PrAction } from "../../core/pr";
import type { PrMeta } from "../../core/types";
import { api, toast } from "../lib";

/**
 * The PR's write actions, through gh. The dropdown carries two checkboxes
 * (admin merge, auto-deploy) that shape the merge, then the actions below
 * them. Every action shows its progress on the button face, and on success
 * the caller's meta is patched immediately so the page flips state without
 * waiting for a refetch; onMerged then confirms against GitHub.
 */
export function HeaderActions({
	pr,
	meta,
	conflicting,
	onPatch,
	onMerged,
}: {
	pr: string;
	meta: PrMeta;
	conflicting: boolean;
	onPatch: (patch: Partial<PrMeta>) => void;
	onMerged: () => void;
}) {
	const [armed, setArmed] = useState<PrAction | null>(null);
	const [busy, setBusy] = useState<PrAction | null>(null);
	const [open, setOpen] = useState(false);
	const [admin, setAdmin] = useState(false);
	const [autoDeploy, setAutoDeploy] = useState<{
		available: boolean;
		enabled: boolean;
		busy: boolean;
	} | null>(null);

	const autoMergeArmed = !!meta.autoMergeRequest;

	const openMenu = () => {
		setOpen(!open);
		if (!open && autoDeploy === null) {
			void api.autoDeploy(pr).then(
				(d) => setAutoDeploy({ ...d, busy: false }),
				() => setAutoDeploy({ available: false, enabled: false, busy: false }),
			);
		}
	};

	const fire = async (action: PrAction, arm: boolean) => {
		if (arm && armed !== action) {
			setArmed(action);
			setTimeout(() => setArmed((a) => (a === action ? null : a)), 3000);
			return;
		}
		setArmed(null);
		setBusy(action);
		setOpen(false);
		try {
			await api.action(pr, action);
			if (action === "merge" || action === "admin-merge") {
				// Flip the page to merged now; onMerged confirms with GitHub.
				onPatch({ state: "MERGED" });
				onMerged();
				toast(action === "admin-merge" ? "Merged (admin)" : "Merged");
			} else if (action === "automerge") {
				onPatch({ autoMergeRequest: { enabledAt: new Date().toISOString() } });
				toast("Auto-merge armed");
			} else if (action === "disable-automerge") {
				onPatch({ autoMergeRequest: null });
				toast("Auto-merge disabled");
			} else if (action === "ready") {
				onPatch({ isDraft: false });
				toast("Marked ready for review");
			} else if (action === "approve") {
				toast("Approved");
			} else {
				toast("Branch update requested");
			}
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), "error");
		} finally {
			setBusy(null);
		}
	};

	const toggleAutoDeploy = async () => {
		if (!autoDeploy || autoDeploy.busy) return;
		const next = !autoDeploy.enabled;
		setAutoDeploy({ ...autoDeploy, enabled: next, busy: true });
		try {
			await api.setAutoDeploy(pr, next);
			setAutoDeploy({ available: true, enabled: next, busy: false });
		} catch (e) {
			setAutoDeploy({ ...autoDeploy, enabled: !next, busy: false });
			toast(e instanceof Error ? e.message : String(e), "error");
		}
	};

	const sure = (action: PrAction, word: string) => (armed === action ? "Sure?" : word);
	const mergeAction: PrAction = admin ? "admin-merge" : "merge";
	const merging = busy === "merge" || busy === "admin-merge";

	const face = merging ? (
		<>
			<LoaderCircle size={13} className="spin" /> Merging…
		</>
	) : busy === "automerge" || busy === "disable-automerge" ? (
		<>
			<LoaderCircle size={13} className="spin" /> Auto-merge…
		</>
	) : autoMergeArmed ? (
		<>
			<Clock size={13} /> Auto-merge armed <ChevronDown size={12} />
		</>
	) : (
		<>
			<GitMerge size={13} /> Merge
			{autoDeploy?.enabled && <span className="deploy-dot" title="Auto-deploy on merge" />}
			<ChevronDown size={12} />
		</>
	);

	return (
		<div className="pr-actions">
			{meta.isDraft && (
				<button
					type="button"
					className="btn light"
					disabled={busy !== null}
					onClick={() => void fire("ready", false)}
				>
					{busy === "ready" && <LoaderCircle size={13} className="spin" />} Ready for review
				</button>
			)}
			{conflicting ? (
				<button type="button" className="btn" disabled>
					<GitMerge size={13} /> Conflicts
				</button>
			) : (
				<div className="overflow-wrap">
					<button
						type="button"
						className={`btn ${meta.isDraft ? "" : "light"} ${autoMergeArmed ? "armed" : ""}`}
						disabled={busy !== null}
						onClick={openMenu}
					>
						{face}
					</button>
					{open && (
						<>
							<div className="menu-veil" onClick={() => setOpen(false)} />
							<div className="menu-pop">
								<button type="button" className="menu-check" onClick={() => setAdmin(!admin)}>
									{admin ? <SquareCheck size={13} /> : <Square size={13} />} Admin merge
									<span className="check-hint">bypass checks</span>
								</button>
								{autoDeploy?.available && (
									<button type="button" className="menu-check" onClick={() => void toggleAutoDeploy()}>
										{autoDeploy.busy ? (
											<LoaderCircle size={13} className="spin" />
										) : autoDeploy.enabled ? (
											<SquareCheck size={13} />
										) : (
											<Square size={13} />
										)}{" "}
										Auto-deploy on merge
									</button>
								)}
								<div className="menu-sep" />
								<button type="button" onClick={() => void fire(mergeAction, true)}>
									<GitMerge size={13} /> {sure(mergeAction, admin ? "Squash and merge (admin)" : "Squash and merge")}
								</button>
								{autoMergeArmed ? (
									<button type="button" onClick={() => void fire("disable-automerge", true)}>
										<Clock size={13} /> {sure("disable-automerge", "Disable auto-merge")}
									</button>
								) : (
									<button type="button" onClick={() => void fire("automerge", true)}>
										<Clock size={13} /> {sure("automerge", "Auto-merge when green")}
									</button>
								)}
								<div className="menu-sep" />
								<button type="button" onClick={() => void fire("approve", true)}>
									<Check size={13} /> {sure("approve", "Approve")}
								</button>
							</div>
						</>
					)}
				</div>
			)}
			<button
				type="button"
				className="btn"
				disabled={busy !== null}
				onClick={() => void fire("update-branch", false)}
			>
				{busy === "update-branch" && <LoaderCircle size={13} className="spin" />} Update branch
			</button>
		</div>
	);
}
