import { ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { Comment, DiffFile, DiffLine } from "../../core/types";
import { languageOf, highlightLine } from "../hl";
import { api, toast, useIdentity } from "../lib";
import { Composer } from "./Composer";
import { Thread } from "./Thread";

function statusChip(f: DiffFile): { word: string; cls: string } | null {
	if (f.status === "added") return { word: "added", cls: "added" };
	if (f.status === "deleted") return { word: "deleted", cls: "deleted" };
	if (f.status === "renamed") return { word: "renamed", cls: "renamed" };
	return null;
}

/** The row key a comment anchors to: the line number on its side of the diff. */
function anchorKey(side: "old" | "new", line: number): string {
	return `${side}:${line}`;
}

function lineKey(l: DiffLine): string | null {
	if (l.new !== null) return anchorKey("new", l.new);
	if (l.old !== null) return anchorKey("old", l.old);
	return null;
}

export function DiffFileCard({
	file,
	pr,
	comments,
	author,
	onChanged,
	refCb,
}: {
	file: DiffFile;
	pr: string;
	comments: Comment[];
	author: string;
	onChanged: (comments: Comment[]) => void;
	refCb: (el: HTMLDivElement | null) => void;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const [composerAt, setComposerAt] = useState<{ side: "old" | "new"; line: number } | null>(null);
	const setAuthor = useIdentity((s) => s.set);
	const language = useMemo(() => languageOf(file.path), [file.path]);

	const byAnchor = useMemo(() => {
		const map = new Map<string, Comment[]>();
		for (const c of comments) {
			const key = anchorKey(c.side, c.line);
			const list = map.get(key) ?? [];
			list.push(c);
			map.set(key, list);
		}
		return map;
	}, [comments]);

	/** Comments whose anchor line is not part of this diff still deserve a home. */
	const orphans = useMemo(() => {
		const shown = new Set<string>();
		for (const h of file.hunks) {
			for (const l of h.lines) {
				const k = lineKey(l);
				if (k) shown.add(k);
			}
		}
		return comments.filter((c) => !shown.has(anchorKey(c.side, c.line)));
	}, [comments, file.hunks]);

	const chip = statusChip(file);
	const refresh = () => api.comments(pr).then(onChanged, () => {});

	const submitAt = async (side: "old" | "new", line: number, body: string) => {
		let name = author;
		if (!name) {
			name = window.prompt("Your name (shown on the comment):")?.trim() ?? "";
			if (!name) {
				toast("A comment needs a name", "error");
				return;
			}
			setAuthor(name);
		}
		await api.add(pr, { path: file.path, side, line, body, author: name });
		setComposerAt(null);
		await refresh();
	};

	return (
		<div className="dfile" ref={refCb}>
			<button type="button" className="dfile-head" onClick={() => setCollapsed(!collapsed)}>
				{collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
				<span className="dfile-path">{file.path}</span>
				{file.status === "renamed" && <span className="dfile-old">← {file.oldPath}</span>}
				{chip && <span className={`fstate ${chip.cls}`}>{chip.word}</span>}
				<span className="spacer" />
				<span className="file-delta">
					{file.additions > 0 && <em className="plus">+{file.additions}</em>}
					{file.deletions > 0 && <em className="minus">−{file.deletions}</em>}
				</span>
			</button>

			{!collapsed && file.binary && <div className="dfile-empty">Binary file.</div>}
			{!collapsed && !file.binary && file.hunks.length === 0 && <div className="dfile-empty">No text changes.</div>}

			{!collapsed && !file.binary && (
				<table className="diff">
					<tbody>
						{file.hunks.map((hunk, hi) => (
							<Fragment key={hi}>
								<tr className="hunk-row">
									<td className="num" />
									<td className="num" />
									<td className="code hunk">{hunk.header || " "}</td>
								</tr>
								{hunk.lines.map((l, li) => {
									const key = lineKey(l);
									const anchored = key ? (byAnchor.get(key) ?? []) : [];
									const side: "old" | "new" = l.new !== null ? "new" : "old";
									const line = (l.new ?? l.old)!;
									const here = composerAt && composerAt.side === side && composerAt.line === line;
									return (
										<Fragment key={li}>
											<tr className={`line ${l.type}`}>
												<td className="num old">{l.old ?? ""}</td>
												<td className="num new">{l.new ?? ""}</td>
												<td className="code">
													<button
														type="button"
														className="add-comment"
														title="Comment on this line"
														onClick={() => setComposerAt(here ? null : { side, line })}
													>
														<MessageSquarePlus size={12} />
													</button>
													<span
														className="code-text"
														// highlight.js output over escaped text; never raw file content
														dangerouslySetInnerHTML={{ __html: highlightLine(l.text, language) }}
													/>
												</td>
											</tr>
											{(anchored.length > 0 || here) && (
												<tr className="anchor-row">
													<td className="num" />
													<td className="num" />
													<td className="anchor-cell">
														{anchored.map((c) => (
															<Thread key={c.id} pr={pr} comment={c} onChanged={onChanged} />
														))}
														{here && (
															<Composer
																placeholder={`Comment on ${file.path.split("/").pop()}:${line}`}
																submitLabel="Comment"
																autoFocus
																onCancel={() => setComposerAt(null)}
																onSubmit={(body) => submitAt(side, line, body)}
															/>
														)}
													</td>
												</tr>
											)}
										</Fragment>
									);
								})}
							</Fragment>
						))}
					</tbody>
				</table>
			)}

			{!collapsed && orphans.length > 0 && (
				<div className="orphans">
					<div className="panel-label">Comments outside this diff</div>
					{orphans.map((c) => (
						<Thread key={c.id} pr={pr} comment={c} onChanged={onChanged} />
					))}
				</div>
			)}
		</div>
	);
}
