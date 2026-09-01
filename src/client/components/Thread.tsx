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
			<span className="who-ico">{session ? <Bot size={11} /> : <UserRound size={11} />}</span>
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
			<div className="thread-head">
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
				{resolved ? (
					<button
						type="button"
						className="btn ghost sm"
						onClick={() => void api.patch(pr, comment.id, { op: "reopen" }).then(refresh)}
					>
						<RotateCcw size={11} /> Reopen
					</button>
				) : (
					<button
						type="button"
						className="btn ghost sm resolve"
						onClick={() => {
							if (needName()) return;
							void api.patch(pr, comment.id, { op: "resolve", author }).then(refresh);
						}}
					>
						<Check size={12} /> Resolve
					</button>
				)}
			</div>

			{editing ? (
				<div className="composer">
					<textarea className="input" rows={4} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
					<div className="composer-row">
						<span className="spacer" />
						<button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>
							Cancel
						</button>
						<button
							type="button"
							className="btn primary sm"
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
				<Markdown text={comment.body} className="thread-body" />
			)}

			{comment.replies.map((r) => (
				<div key={r.id} className="reply">
					<Who author={r.author} session={r.session} when={timeAgo(r.createdAt)} />
					<Markdown text={r.body} className="reply-body" />
				</div>
			))}

			{replying ? (
				<Composer
					placeholder="Reply…"
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
				<div className="thread-foot">
					<button type="button" className="btn ghost sm" onClick={() => setReplying(true)}>
						Reply
					</button>
					{resolved && (
						<button type="button" className="btn ghost sm" onClick={() => setCollapsed(true)}>
							Collapse
						</button>
					)}
				</div>
			)}
		</div>
	);
}
