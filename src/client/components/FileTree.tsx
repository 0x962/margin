import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { useMemo, useState } from "react";
import type { Comment, DiffFile } from "../../core/types";
import { buildTree, type TreeDir } from "../tree";

export function FileTree({
	files,
	byFile,
	onPick,
}: {
	files: DiffFile[];
	byFile: Map<string, Comment[]>;
	onPick: (path: string) => void;
}) {
	const tree = useMemo(() => buildTree(files), [files]);
	const [closed, setClosed] = useState<Set<string>>(new Set());

	const toggle = (path: string) =>
		setClosed((s) => {
			const next = new Set(s);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});

	const renderDir = (dir: TreeDir, depth: number) => {
		const isClosed = closed.has(dir.path);
		return (
			<div key={dir.path}>
				<button
					type="button"
					className="tree-dir"
					style={{ paddingLeft: 8 + depth * 12 }}
					onClick={() => toggle(dir.path)}
				>
					{isClosed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
					<Folder size={11} className="tree-folder" />
					<span className="tree-dir-name" title={dir.path}>
						{dir.name}
					</span>
				</button>
				{!isClosed && renderBody(dir, depth + 1)}
			</div>
		);
	};

	const renderBody = (dir: TreeDir, depth: number) => (
		<>
			{dir.dirs.map((d) => renderDir(d, depth))}
			{dir.files.map((f) => {
				const open = (byFile.get(f.path) ?? []).filter((c) => c.status === "open").length;
				return (
					<button
						type="button"
						key={f.path}
						className="file-row"
						style={{ paddingLeft: 8 + depth * 12 + 14 }}
						title={f.path}
						onClick={() => onPick(f.path)}
					>
						<span className="file-name">{f.path.split("/").pop()}</span>
						{open > 0 && <span className="file-open">{open}</span>}
						<span className="file-delta">
							{f.additions > 0 && <em className="plus">+{f.additions}</em>}
							{f.deletions > 0 && <em className="minus">−{f.deletions}</em>}
						</span>
					</button>
				);
			})}
		</>
	);

	return <div className="file-list">{renderBody(tree, 0)}</div>;
}
