import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { Comment, DiffFile } from "../../core/types";
import { buildTree, type TreeDir } from "../tree";

/** Per-language tints for the extension badge, GitHub's language colors. */
const LANG_COLOR: Record<string, string> = {
	py: "#3572A5",
	ts: "#3178c6",
	tsx: "#3178c6",
	js: "#f1e05a",
	jsx: "#f1e05a",
	rb: "#701516",
	go: "#00ADD8",
	rs: "#dea584",
	java: "#b07219",
	kt: "#A97BFF",
	swift: "#F05138",
	css: "#663399",
	html: "#e34c26",
	md: "#519aba",
	json: "#a8b1c2",
	yml: "#cb171e",
	yaml: "#cb171e",
	toml: "#9c4221",
	sql: "#e38c00",
	sh: "#89e051",
	lock: "#6b7280",
};

function ExtBadge({ path }: { path: string }) {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	const color = LANG_COLOR[ext] ?? "#6b7280";
	return (
		<span className="ext-badge" style={{ color, borderColor: `${color}55` }}>
			{ext.slice(0, 4)}
		</span>
	);
}

const STATUS_LETTER: Record<DiffFile["status"], { letter: string; cls: string }> = {
	added: { letter: "A", cls: "added" },
	modified: { letter: "M", cls: "modified" },
	deleted: { letter: "D", cls: "deleted" },
	renamed: { letter: "R", cls: "renamed" },
};

function countFiles(dir: TreeDir): number {
	return dir.files.length + dir.dirs.reduce((t, d) => t + countFiles(d), 0);
}

/**
 * The changed files as the app's pane drew them: directory rows with their
 * path segments separated by slashes and a per-directory count, file rows
 * with a language badge, the name tinted by its change status, the +/-
 * delta, and the status letter.
 */
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
	const [rootClosed, setRootClosed] = useState(false);

	const toggle = (path: string) =>
		setClosed((s) => {
			const next = new Set(s);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});

	const segments = (name: string) => {
		const parts = name.split("/");
		return parts.map((part, i) => (
			<Fragment key={i}>
				{i > 0 && <span className="tree-sep">/</span>}
				{part}
			</Fragment>
		));
	};

	const renderDir = (dir: TreeDir, depth: number) => {
		const isClosed = closed.has(dir.path);
		return (
			<div key={dir.path}>
				<button
					type="button"
					className="tree-dir"
					style={{ paddingLeft: 10 + depth * 12 }}
					onClick={() => toggle(dir.path)}
				>
					{isClosed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
					<span className="tree-dir-name" title={dir.path}>
						{segments(dir.name)}
					</span>
					<span className="spacer" />
					<span className="tree-count">{countFiles(dir)}</span>
					<span className="tree-dot" />
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
				const status = STATUS_LETTER[f.status];
				return (
					<button
						type="button"
						key={f.path}
						className="file-row"
						style={{ paddingLeft: 10 + depth * 12 + 14 }}
						title={f.path}
						onClick={() => onPick(f.path)}
					>
						<ExtBadge path={f.path} />
						<span className={`file-name st-${status.cls}`}>{f.path.split("/").pop()}</span>
						{open > 0 && <span className="file-open">{open}</span>}
						<span className="spacer" />
						<span className="file-delta">
							{f.additions > 0 && <em className="plus">+{f.additions}</em>}
							{f.deletions > 0 && <em className="minus">−{f.deletions}</em>}
						</span>
						<span className={`file-letter st-${status.cls}`}>{status.letter}</span>
					</button>
				);
			})}
		</>
	);

	return (
		<div className="file-list">
			<button type="button" className="tree-section" onClick={() => setRootClosed(!rootClosed)}>
				{rootClosed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
				<b>Changed</b>
				<span className="dim">{files.length}</span>
			</button>
			{!rootClosed && renderBody(tree, 0)}
		</div>
	);
}
