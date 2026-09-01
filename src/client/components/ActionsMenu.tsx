import { Check, GitMerge } from "lucide-react";
import { useState } from "react";
import type { PrAction } from "../../core/pr";
import { api, toast } from "../lib";

/**
 * Approve and merge, through gh. A destructive click arms first and fires on
 * the second click, instead of a blocking browser dialog.
 */
export function ActionsMenu({ pr, onDone }: { pr: string; onDone: () => void }) {
	const [armed, setArmed] = useState<PrAction | null>(null);
	const [busy, setBusy] = useState(false);

	const fire = async (action: PrAction) => {
		if (armed !== action) {
			setArmed(action);
			setTimeout(() => setArmed((a) => (a === action ? null : a)), 3000);
			return;
		}
		setArmed(null);
		setBusy(true);
		try {
			await api.action(pr, action);
			toast(action === "approve" ? "Approved" : action === "merge" ? "Merged" : "Auto-merge armed");
			onDone();
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), "error");
		} finally {
			setBusy(false);
		}
	};

	const label = (action: PrAction, word: string) => (armed === action ? "Sure?" : word);
	return (
		<div className="pr-actions">
			<button type="button" className="btn sm" disabled={busy} onClick={() => void fire("approve")}>
				<Check size={12} /> {label("approve", "Approve")}
			</button>
			<button
				type="button"
				className={`btn sm ${armed === "merge" ? "danger" : ""}`}
				disabled={busy}
				onClick={() => void fire("merge")}
			>
				<GitMerge size={12} /> {label("merge", "Merge")}
			</button>
			<button type="button" className="btn ghost sm" disabled={busy} onClick={() => void fire("automerge")}>
				{label("automerge", "Auto-merge")}
			</button>
		</div>
	);
}
