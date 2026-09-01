import type { CheckRun } from "../../core/types";

const BUCKET: Record<string, { cls: string; word: string }> = {
	pass: { cls: "pass", word: "passed" },
	fail: { cls: "fail", word: "failed" },
	pending: { cls: "pending", word: "running" },
	skipping: { cls: "skip", word: "skipped" },
	cancel: { cls: "fail", word: "cancelled" },
};

export function ChecksSection({ checks }: { checks: CheckRun[] | null }) {
	if (!checks || checks.length === 0) return null;
	const fails = checks.filter((c) => c.bucket === "fail" || c.bucket === "cancel").length;
	const pending = checks.filter((c) => c.bucket === "pending").length;
	const summary = fails > 0 ? `${fails} failing` : pending > 0 ? `${pending} running` : "all green";
	return (
		<>
			<div className="panel-label">
				Checks <span className={`dim ${fails > 0 ? "fail-text" : ""}`}>{summary}</span>
			</div>
			<div className="checks">
				{checks.map((c) => {
					const b = BUCKET[c.bucket] ?? { cls: "skip", word: c.bucket };
					return (
						<a key={`${c.workflow}/${c.name}`} className="check-row" href={c.link} target="_blank" rel="noreferrer">
							<span className={`check-dot ${b.cls}`} />
							<span className="check-name" title={`${c.workflow} · ${c.name} · ${b.word}`}>
								{c.name}
							</span>
							<span className="check-word">{b.word}</span>
						</a>
					);
				})}
			</div>
		</>
	);
}
