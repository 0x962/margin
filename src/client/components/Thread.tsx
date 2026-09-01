import { Bot, Check, Pencil, RotateCcw, UserRound } from "lucide-react";
import { useState } from "react";
import type { Comment } from "../../core/types";
import { api, timeAgo, toast, useIdentity } from "../lib";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";

function copySession(session: string) {
	void navigator.clipboard.writeText(session);
	toast("Session id copied · resume with: claude --resume " + session.slice(0, 8) + "…");
}

function Who({ author, session, when }: { author: string; session?: string; when: string }) {
	return (
		<span className="who">
			<span className="who-ico">{session ? <Bot size={12} /> : <UserRound size={12} />}</span>
			<b>{author}</b>
			{session && (
				<button
					type="button"
					className="who-session"
					title={`agent session ${session} · click to copy`}
					onClick={() => copySession(session)}
				>
					{session.slice(0, 8)}
				</button>
			)}
			<span className="who-when">{when}</span>
		</span>
	);
}

/**
 * One review thread, drawn the way GitHub draws them: every comment is a
 * block with its own header row, replies stack full-width under separators,
 * and the footer carries the reply box and the resolve action.
 */
export function Thread({
	pr,
	comment,
	onChanged,
}: {
	pr: string;
	comment: Comment;
	onChanged: (comments: Comment[]) => void;
}) {
	const author = useIdentity((s) => s.author);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const [replying, setReplying] = useState(false);
	const resolved = comment.status === "resolved";
	const [collapsed, setCollapsed] = useState(resolved);

	const refresh = () => api.comments(pr).then(onChanged, () => {});
	const needName = (): boolean => {
		if (author) return false;
		toast("Set your name first (top right)", "error");
		return true;
	};

	if (collapsed) {
		return (
			<div id={`thread-${comment.id}`} className="thread collapsed" onClick={() => setCollapsed(false)}>
				<Check size={11} className="ok" />
				<span className="collapsed-body">{comment.body.split("\n")[0]}</span>
				<span className="collapsed-meta">
					{comment.author} · resolved by {comment.resolvedBy ?? "?"}
				</span>
			</div>
		);
	}

	return (
		<div id={`thread-${comment.id}`} className={`thread ${comment.status}`}>
			<div className="cm">
				<div className="cm-head">
					<Who author={comment.author} session={comment.session} when={timeAgo(comment.createdAt)} />
					<span className="spacer" />
					<button
						type="button"
						className="btn ghost icon xs"
						title="Edit"
						onClick={() => {
							setDraft(comment.body);
							setEditing(true);
						}}
					>
						<Pencil size={11} />
					</button>
				</div>
				{editing ? (
					<div className="cm-body">
						<textarea className="input" rows={4} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
						<div className="composer-row">
							<span className="spacer" />
							<button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>
								Cancel
							</button>
							<button
								type="button"
								className="btn light sm"
								onClick={() =>
									void api.patch(pr, comment.id, { op: "edit", body: draft }).then(() => {
										setEditing(false);
										void refresh();
									})
								}
							>
								Save
							</button>
						</div>
					</div>
				) : (
					<Markdown text={comment.body} className="cm-body" />
				)}
			</div>

			{comment.replies.map((r) => (
				<div key={r.id} className="cm reply">
					<div className="cm-head">
						<Who author={r.author} session={r.session} when={timeAgo(r.createdAt)} />
					</div>
					<Markdown text={r.body} className="cm-body" />
				</div>
			))}

			<div className="thread-foot">
				{replying ? (
					<Composer
						placeholder="Write a reply"
						submitLabel="Reply"
						autoFocus
						onCancel={() => setReplying(false)}
						onSubmit={async (body) => {
							if (needName()) return;
							await api.reply(pr, comment.id, { body, author });
							setReplying(false);
							await refresh();
						}}
					/>
				) : (
					<>
						<button type="button" className="reply-box" onClick={() => setReplying(true)}>
							Write a reply…
						</button>
						{resolved ? (
							<button
								type="button"
								className="btn sm"
								onClick={() => void api.patch(pr, comment.id, { op: "reopen" }).then(refresh)}
							>
								<RotateCcw size={11} /> Reopen
							</button>
						) : (
							<button
								type="button"
								className="btn sm resolve"
								onClick={() => {
									if (needName()) return;
									void api.patch(pr, comment.id, { op: "resolve", author }).then(refresh);
								}}
							>
								<Check size={12} /> Resolve
							</button>
						)}
					</>
				)}
			</div>
		</div>
	);
}
