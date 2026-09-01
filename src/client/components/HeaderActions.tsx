import { Check, ChevronDown, GitMerge } from "lucide-react";
import { useState } from "react";
import type { PrAction } from "../../core/pr";
import { api, toast } from "../lib";

/**
 * The PR's write actions, through gh. A destructive click arms first and
 * fires on the second click, instead of a blocking browser dialog.
 */
export function HeaderActions({ pr, isDraft, onDone }: { pr: string; isDraft: boolean; onDone: () => void }) {
	const [armed, setArmed] = useState<PrAction | null>(null);
	const [busy, setBusy] = useState<PrAction | null>(null);
	const [open, setOpen] = useState(false);

	const fire = async (action: PrAction, arm: boolean) => {
		if (arm && armed !== action) {
			setArmed(action);
			setTimeout(() => setArmed((a) => (a === action ? null : a)), 3000);
			return;
		}
		setArmed(null);
		setBusy(action);
		try {
			await api.action(pr, action);
			toast(
				{
					approve: "Approved",
					merge: "Merged",
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
			setBusy(null);
		}
	};

	const sure = (action: PrAction, word: string) => (armed === action ? "Sure?" : word);

	return (
		<div className="pr-actions">
			{isDraft && (
				<button type="button" className="btn sm" disabled={busy !== null} onClick={() => void fire("ready", false)}>
					Ready for review
				</button>
			)}
			<button
				type="button"
				className="btn sm"
				disabled={busy !== null}
				onClick={() => void fire("update-branch", false)}
			>
				Update branch
			</button>
			<div className="overflow-wrap">
				<button type="button" className="btn sm" onClick={() => setOpen(!open)}>
					<GitMerge size={12} /> Merge <ChevronDown size={11} />
				</button>
				{open && (
					<>
						<div className="menu-veil" onClick={() => setOpen(false)} />
						<div className="menu-pop">
							<button type="button" disabled={busy !== null} onClick={() => void fire("approve", true)}>
								<Check size={12} /> {sure("approve", "Approve")}
							</button>
							<button type="button" disabled={busy !== null} onClick={() => void fire("merge", true)}>
								<GitMerge size={12} /> {sure("merge", "Squash and merge")}
							</button>
							<button type="button" disabled={busy !== null} onClick={() => void fire("automerge", true)}>
								{sure("automerge", "Auto-merge when green")}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
