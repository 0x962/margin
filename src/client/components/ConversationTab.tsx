import { Bot, UserRound } from "lucide-react";
import type { ConversationEntry } from "../../core/pr";
import type { Comment } from "../../core/types";
import { timeAgo } from "../lib";
import { Markdown } from "./Markdown";
import { Thread } from "./Thread";

const VERDICT: Record<string, { word: string; cls: string }> = {
	APPROVED: { word: "approved", cls: "pass" },
	CHANGES_REQUESTED: { word: "requested changes", cls: "fail" },
	COMMENTED: { word: "commented", cls: "skip" },
	DISMISSED: { word: "dismissed", cls: "skip" },
};

/**
 * The PR's description and GitHub conversation (read-only; people talk on
 * GitHub), then margin's own threads, which are fully editable here.
 */
export function ConversationTab({
	pr,
	description,
	entries,
	comments,
	onChanged,
	onJump,
}: {
	pr: string;
	description: string | null;
	entries: ConversationEntry[] | null;
	comments: Comment[];
	onChanged: (comments: Comment[]) => void;
	onJump: (comment: Comment) => void;
}) {
	const sorted = [...comments].sort((a, b) =>
		a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === "open" ? -1 : 1,
	);
	return (
		<div className="conv">
			{description !== null && (
				<section className="conv-card">
					<div className="panel-label">Description</div>
					{description.trim() ? (
						<Markdown text={description} className="conv-body" />
					) : (
						<p className="conv-empty">No description.</p>
					)}
				</section>
			)}

			{entries && entries.length > 0 && (
				<section className="conv-card">
					<div className="panel-label">On GitHub</div>
					{entries.map((entry, i) => {
						const verdict = entry.verdict ? VERDICT[entry.verdict] : null;
						return (
							<div key={i} className="conv-entry">
								<span className="who">
									<span className="who-ico">
										{entry.author.endsWith("[bot]") ? <Bot size={11} /> : <UserRound size={11} />}
									</span>
									<b>{entry.author}</b>
									{verdict && <span className={`conv-verdict ${verdict.cls}`}>{verdict.word}</span>}
									<span className="who-when">{timeAgo(entry.createdAt)}</span>
								</span>
								{entry.body.trim() && <Markdown text={entry.body} className="conv-body" />}
							</div>
						);
					})}
				</section>
			)}

			<section className="conv-card">
				<div className="panel-label">
					Review comments <span className="dim">{comments.filter((c) => c.status === "open").length} open</span>
				</div>
				{sorted.length === 0 && <p className="conv-empty">No local review comments yet.</p>}
				{sorted.map((c) => (
					<div key={c.id} className="conv-thread">
						<button type="button" className="conv-anchor mono" onClick={() => onJump(c)}>
							{c.path.split("/").pop()}:{c.startLine ? `${c.startLine}-${c.line}` : c.line}
						</button>
						<Thread pr={pr} comment={c} onChanged={onChanged} />
					</div>
				))}
			</section>
		</div>
	);
}
