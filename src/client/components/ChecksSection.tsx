import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import type { CheckRun } from "../../core/types";

/** fail first, then running, then passed; skipped checks are not listed. */
const ORDER: Record<string, number> = { fail: 0, cancel: 0, pending: 1, pass: 2 };

export function checksSummary(checks: CheckRun[] | null) {
	const listed = (checks ?? []).filter((c) => c.bucket !== "skipping");
	const fails = listed.filter((c) => c.bucket === "fail" || c.bucket === "cancel").length;
	const pending = listed.filter((c) => c.bucket === "pending").length;
	const passed = listed.filter((c) => c.bucket === "pass").length;
	return { listed, fails, pending, passed, total: listed.length };
}

function StatusIcon({ bucket }: { bucket: string }) {
	if (bucket === "fail" || bucket === "cancel") return <X size={13} className="ci-ico fail" />;
	if (bucket === "pending") return <LoaderCircle size={13} className="ci-ico pending spin-slow" />;
	return <Check size={13} className="ci-ico pass" />;
}

export function ChecksSection({ checks }: { checks: CheckRun[] | null }) {
	const { listed, fails, pending, passed, total } = checksSummary(checks);
	if (listed.length === 0) return <p className="conv-empty">No checks reported.</p>;
	const rows = [...listed].sort(
		(a, b) => (ORDER[a.bucket] ?? 2) - (ORDER[b.bucket] ?? 2) || a.name.localeCompare(b.name),
	);
	return (
		<div className="ci">
			<div className="ci-head">
				<ChevronDown size={13} />
				<b>Checks</b>
				<span className="dim">{total}</span>
				<span className="spacer" />
				{fails > 0 ? (
					<span className="ci-summary fail">
						<X size={14} /> {fails} failing
					</span>
				) : pending > 0 ? (
					<span className="ci-summary pending">
						<LoaderCircle size={14} className="spin-slow" /> {passed}/{total} checks passing
					</span>
				) : (
					<span className="ci-summary pass">
						<Check size={14} /> {passed}/{total} checks passing
					</span>
				)}
			</div>
			{rows.map((c) => (
				<a
					key={`${c.workflow}/${c.name}`}
					className="ci-row"
					href={c.link}
					target="_blank"
					rel="noreferrer"
					title={`${c.workflow} · ${c.name}`}
				>
					<StatusIcon bucket={c.bucket} />
					<span className="ci-name">{c.name}</span>
				</a>
			))}
		</div>
	);
}
