import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { Comment, DiffFile } from "../../core/types";
import { buildTree, type TreeDir } from "../tree";

interface IconManifest {
	fileNames: Record<string, string>;
	fileExtensions: Record<string, string>;
	defaultIcon: string;
}

let manifestCache: IconManifest | null = null;
let manifestPromise: Promise<IconManifest> | null = null;

function loadManifest(): Promise<IconManifest> {
	manifestPromise ??= fetch("/api/file-icons/manifest")
		.then((r) => r.json() as Promise<IconManifest>)
		.then((m) => {
			manifestCache = m;
			return m;
		});
	return manifestPromise;
}

/** "a.test.py" tries "a.test.py", then "test.py", then "py". */
function iconFor(m: IconManifest, base: string): string {
	const lower = base.toLowerCase();
	if (m.fileNames[lower]) return m.fileNames[lower];
	const parts = lower.split(".");
	for (let i = 1; i < parts.length; i++) {
		const ext = parts.slice(i).join(".");
		if (m.fileExtensions[ext]) return m.fileExtensions[ext];
	}
	return m.defaultIcon;
}

function FileIcon({ path }: { path: string }) {
	const [manifest, setManifest] = useState(manifestCache);
	useEffect(() => {
		if (!manifest) void loadManifest().then(setManifest);
	}, [manifest]);
	const base = path.split("/").pop() ?? "";
	const icon = manifest ? iconFor(manifest, base) : "file";
	return <img className="file-ico" src={`/file-icons/${icon}.svg`} width={14} height={14} alt="" />;
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

/** One indent step, kept shallow so deep trees stay on screen. */
const STEP = 5;
/** Files clear the chevron so their icons align under the parent's text. */
const FILE_OFFSET = 20;

/**
 * The changed files as the app's pane drew them: directory rows with their
 * path segments separated by slashes and a right-aligned count and change
 * dot, file rows with the language's icon, the name tinted by its change
 * status, and the delta and status letter in fixed end columns so every row
 * lines up.
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
					style={{ paddingLeft: 10 + depth * STEP }}
					onClick={() => toggle(dir.path)}
				>
					{isClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
					<span className="tree-dir-name" title={dir.path}>
						{segments(dir.name)}
					</span>
					<span className="row-right">
						<span className="row-delta dim">{countFiles(dir)}</span>
						<span className="row-mark">
							<span className="tree-dot" />
						</span>
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
				const status = STATUS_LETTER[f.status];
				return (
					<button
						type="button"
						key={f.path}
						className="file-row"
						style={{ paddingLeft: 10 + depth * STEP + FILE_OFFSET }}
						title={f.path}
						onClick={() => onPick(f.path)}
					>
						<FileIcon path={f.path} />
						<span className={`file-name st-${status.cls}`}>{f.path.split("/").pop()}</span>
						{open > 0 && <span className="file-open">{open}</span>}
						<span className="row-right">
							<span className="row-delta">
								{f.additions > 0 && <em className="plus">+{f.additions}</em>}
								{f.deletions > 0 && <em className="minus">−{f.deletions}</em>}
							</span>
							<span className={`row-mark file-letter st-${status.cls}`}>{status.letter}</span>
						</span>
					</button>
				);
			})}
		</>
	);

	return (
		<div className="file-list">
			<button type="button" className="tree-section" onClick={() => setRootClosed(!rootClosed)}>
				{rootClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
				<b>Committed</b>
				<span className="dim">{files.length}</span>
			</button>
			{!rootClosed && renderBody(tree, 0)}
		</div>
	);
}
