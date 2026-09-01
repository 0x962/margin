import { Check, ChevronDown, GitMerge, ShieldCheck, Square, SquareCheck } from "lucide-react";
import { useState } from "react";
import type { PrAction } from "../../core/pr";
import { api, toast } from "../lib";

/**
 * The PR's write actions, through gh, styled like the app's pane: white pill
 * for the primary action, a merge menu behind it. A destructive click arms
 * first and fires on the second click, instead of a blocking browser dialog.
 * A conflicting branch swaps the merge menu for an inert Conflicts pill.
 */
export function HeaderActions({
	pr,
	isDraft,
	conflicting,
	onDone,
}: {
	pr: string;
	isDraft: boolean;
	conflicting: boolean;
	onDone: () => void;
}) {
	const [armed, setArmed] = useState<PrAction | null>(null);
	const [busy, setBusy] = useState(false);
	const [open, setOpen] = useState(false);
	const [autoDeploy, setAutoDeploy] = useState<{ available: boolean; enabled: boolean } | null>(null);

	const openMenu = () => {
		setOpen(!open);
		if (!open && autoDeploy === null) {
			void api.autoDeploy(pr).then(setAutoDeploy, () => setAutoDeploy({ available: false, enabled: false }));
		}
	};

	const fire = async (action: PrAction, arm: boolean) => {
		if (arm && armed !== action) {
			setArmed(action);
			setTimeout(() => setArmed((a) => (a === action ? null : a)), 3000);
			return;
		}
		setArmed(null);
		setBusy(true);
		try {
			await api.action(pr, action);
			toast(
				{
					approve: "Approved",
					merge: "Merged",
					"admin-merge": "Merged (admin)",
					automerge: "Auto-merge armed",
					ready: "Marked ready for review",
					"update-branch": "Branch update requested",
				}[action],
			);
			setOpen(false);
			onDone();
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), "error");
		} finally {
			setBusy(false);
		}
	};

	const toggleAutoDeploy = async () => {
		if (!autoDeploy) return;
		const next = !autoDeploy.enabled;
		setAutoDeploy({ ...autoDeploy, enabled: next });
		try {
			await api.setAutoDeploy(pr, next);
			toast(next ? "Auto-deploy label added" : "Auto-deploy label removed");
		} catch (e) {
			setAutoDeploy({ ...autoDeploy, enabled: !next });
			toast(e instanceof Error ? e.message : String(e), "error");
		}
	};

	const sure = (action: PrAction, word: string) => (armed === action ? "Sure?" : word);

	return (
		<div className="pr-actions">
			{isDraft && (
				<button type="button" className="btn light" disabled={busy} onClick={() => void fire("ready", false)}>
					Ready for review
				</button>
			)}
			{conflicting ? (
				<button type="button" className="btn" disabled>
					<GitMerge size={13} /> Conflicts
				</button>
			) : (
				<div className="overflow-wrap">
					<button type="button" className={`btn ${isDraft ? "" : "light"}`} onClick={openMenu}>
						<GitMerge size={13} /> Merge <ChevronDown size={12} />
					</button>
					{open && (
						<>
							<div className="menu-veil" onClick={() => setOpen(false)} />
							<div className="menu-pop">
								<button type="button" disabled={busy} onClick={() => void fire("approve", true)}>
									<Check size={13} /> {sure("approve", "Approve")}
								</button>
								<button type="button" disabled={busy} onClick={() => void fire("merge", true)}>
									<GitMerge size={13} /> {sure("merge", "Squash and merge")}
								</button>
								<button type="button" disabled={busy} onClick={() => void fire("admin-merge", true)}>
									<ShieldCheck size={13} /> {sure("admin-merge", "Admin merge")}
								</button>
								<button type="button" disabled={busy} onClick={() => void fire("automerge", true)}>
									{sure("automerge", "Auto-merge when green")}
								</button>
								{autoDeploy?.available && (
									<>
										<div className="menu-sep" />
										<button type="button" disabled={busy} onClick={() => void toggleAutoDeploy()}>
											{autoDeploy.enabled ? <SquareCheck size={13} /> : <Square size={13} />} Auto-deploy on
											merge
										</button>
									</>
								)}
							</div>
						</>
					)}
				</div>
			)}
			<button type="button" className="btn" disabled={busy} onClick={() => void fire("update-branch", false)}>
				Update branch
			</button>
		</div>
	);
}
