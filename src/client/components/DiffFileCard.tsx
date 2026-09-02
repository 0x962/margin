import { ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { Comment, DiffFile, DiffLine } from "../../core/types";
import { languageOf, highlightLine } from "../hl";
import { api, toast, useIdentity } from "../lib";
import { pairLines } from "../tree";
import { Composer } from "./Composer";
import { Thread } from "./Thread";

export type DiffView = "unified" | "split";

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

interface Anchor {
	side: "old" | "new";
	line: number;
}

export function DiffFileCard({
	file,
	pr,
	view,
	comments,
	author,
	onChanged,
	refCb,
}: {
	file: DiffFile;
	pr: string;
	view: DiffView;
	comments: Comment[];
	author: string;
	onChanged: (comments: Comment[]) => void;
	refCb: (el: HTMLDivElement | null) => void;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const [composerAt, setComposerAt] = useState<Anchor | null>(null);
	const setAuthor = useIdentity((s) => s.set);
	const language = useMemo(() => languageOf(file.path), [file.path]);
	const cols = view === "split" ? 4 : 2;

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

	const submitAt = async (at: Anchor, body: string) => {
		let name = author;
		if (!name) {
			name = (await api.whoami().catch(() => ({ author: "" }))).author;
			if (!name) {
				toast("A comment needs a name; set one in the top-right menu", "error");
				return;
			}
			setAuthor(name);
		}
		await api.add(pr, { path: file.path, side: at.side, line: at.line, body, author: name });
		setComposerAt(null);
		await refresh();
	};

	const isAt = (at: Anchor) => composerAt?.side === at.side && composerAt.line === at.line;

	const addBtn = (at: Anchor) => (
		<button
			type="button"
			className="add-comment"
			title="Comment on this line"
			onClick={() => setComposerAt(isAt(at) ? null : at)}
		>
			<MessageSquarePlus size={12} />
		</button>
	);

	const code = (l: DiffLine) => (
		<span
			className="code-text"
			// highlight.js output over escaped text; never raw file content
			dangerouslySetInnerHTML={{ __html: highlightLine(l.text, language) }}
		/>
	);

	/** Threads and the composer for the anchors this row shows. */
	const anchorRow = (keys: Anchor[]) => {
		const threads = keys.flatMap((k) => byAnchor.get(anchorKey(k.side, k.line)) ?? []);
		const composing = keys.find((k) => isAt(k));
		if (threads.length === 0 && !composing) return null;
		return (
			<tr className="anchor-row">
				<td className="num" />
				<td className="anchor-cell" colSpan={cols - 1}>
					{threads.map((c) => (
						<Thread key={c.id} pr={pr} comment={c} onChanged={onChanged} />
					))}
					{composing && (
						<Composer
							placeholder={`Comment on ${file.path.split("/").pop()}:${composing.line}`}
							submitLabel="Comment"
							autoFocus
							onCancel={() => setComposerAt(null)}
							onSubmit={(body) => submitAt(composing, body)}
						/>
					)}
				</td>
			</tr>
		);
	};

	const unifiedRows = (lines: DiffLine[]) =>
		lines.map((l, li) => {
			const side: "old" | "new" = l.new !== null ? "new" : "old";
			const at: Anchor = { side, line: (l.new ?? l.old)! };
			return (
				<Fragment key={li}>
					<tr className={`line ${l.type}`}>
						<td className={`num ${l.type === "del" ? "old" : "new"}`}>{l.new ?? l.old ?? ""}</td>
						<td className="code">
							{addBtn(at)}
							{code(l)}
						</td>
					</tr>
					{anchorRow([at])}
				</Fragment>
			);
		});

	const splitRows = (lines: DiffLine[]) =>
		pairLines(lines).map((row, ri) => {
			const anchors: Anchor[] = [];
			// A context line lives on both sides but takes one anchor, on the
			// new side; only a deletion anchors to the old side.
			if (row.left && row.left.type === "del") anchors.push({ side: "old", line: row.left.old! });
			if (row.right && row.right.new !== null) anchors.push({ side: "new", line: row.right.new });
			return (
				<Fragment key={ri}>
					<tr className="line split">
						<td className={`num old ${row.left?.type === "del" ? "in-del" : ""}`}>{row.left?.old ?? ""}</td>
						<td className={`code half ${row.left ? (row.left.type === "del" ? "cl-del" : "") : "cl-empty"}`}>
							{row.left && row.left.type === "del" && addBtn({ side: "old", line: row.left.old! })}
							{row.left && code(row.left)}
						</td>
						<td className={`num new ${row.right?.type === "add" ? "in-add" : ""}`}>{row.right?.new ?? ""}</td>
						<td className={`code half ${row.right ? (row.right.type === "add" ? "cl-add" : "") : "cl-empty"}`}>
							{row.right && row.right.new !== null && addBtn({ side: "new", line: row.right.new })}
							{row.right && code(row.right)}
						</td>
					</tr>
					{anchorRow(anchors)}
				</Fragment>
			);
		});

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
				<table className={`diff ${view}`}>
					{/* table-layout is fixed, and the first body row spans columns;
					    the colgroup is what actually defines the grid. */}
					{view === "split" ? (
						<colgroup>
							<col className="c-num" />
							<col />
							<col className="c-num" />
							<col />
						</colgroup>
					) : (
						<colgroup>
							<col className="c-num" />
							<col />
						</colgroup>
					)}
					<tbody>
						{file.hunks.map((hunk, hi) => (
							<Fragment key={hi}>
								<tr className="hunk-row">
									<td className="num" />
									<td className="code hunk" colSpan={cols - 1}>
										<span className="hunk-range">@@ {hunk.range}</span>
										{hunk.header && <span className="hunk-ctx">{hunk.header}</span>}
									</td>
								</tr>
								{view === "split" ? splitRows(hunk.lines) : unifiedRows(hunk.lines)}
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
