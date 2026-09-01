import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { parsePrRef } from "../core/pr";
import type { Comment } from "../core/types";
import { api, timeAgo, useIdentity, useToasts, type PrPayload } from "./lib";
import { DiffFileCard, type DiffView } from "./components/DiffFileCard";
import { FileTree } from "./components/FileTree";
import { IdentityMenu } from "./components/IdentityMenu";

function Toasts() {
	const toasts = useToasts((s) => s.toasts);
	if (toasts.length === 0) return null;
	return (
		<div className="toasts">
			{toasts.map((t) => (
				<div key={t.id} className={`toast ${t.kind}`}>
					{t.text}
				</div>
			))}
		</div>
	);
}

function Landing() {
	const [prs, setPrs] = useState<Awaited<ReturnType<typeof api.prs>>>([]);
	const [value, setValue] = useState("");
	useEffect(() => {
		void api.prs().then(setPrs, () => {});
	}, []);
	const go = () => {
		const ref = parsePrRef(value);
		if (ref) location.href = `/https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;
	};
	return (
		<div className="landing">
			<div className="landing-card">
				<div className="brand big">
					<span className="mark" />
					margin
				</div>
				<p className="landing-lede">Local review comments on GitHub pull requests, for humans and agents.</p>
				<div className="landing-input">
					<input
						className="input"
						autoFocus
						placeholder="Paste a GitHub PR URL and press Enter"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && go()}
					/>
				</div>
				{prs.length > 0 && (
					<div className="landing-recent">
						<div className="panel-label">Reviews</div>
						{prs.map((p) => (
							<a key={p.url} className="recent-row" href={`/${p.url}`}>
								<span className="recent-name">
									{p.ref.repo}
									<b>#{p.ref.number}</b>
								</span>
								<span className="recent-counts">
									{p.open > 0 && <span className="count open">{p.open} open</span>}
									{p.resolved > 0 && <span className="count">{p.resolved} resolved</span>}
								</span>
								<span className="recent-when">{p.updatedAt ? timeAgo(p.updatedAt) : ""}</span>
							</a>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function stateChip(meta: PrPayload["meta"]): { word: string; cls: string } {
	if (meta.isDraft) return { word: "Draft", cls: "draft" };
	const s = meta.state.toLowerCase();
	if (s === "open") return { word: "Open", cls: "open" };
	if (s === "merged") return { word: "Merged", cls: "merged" };
	return { word: "Closed", cls: "closed" };
}

function Review({ pr }: { pr: string }) {
	const [data, setData] = useState<PrPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [comments, setComments] = useState<Comment[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [view, setView] = useState<DiffView>(
		(localStorage.getItem("margin:view") as DiffView) === "split" ? "split" : "unified",
	);
	const author = useIdentity((s) => s.author);
	const fileRefs = useRef(new Map<string, HTMLDivElement>());
	const pickView = (v: DiffView) => {
		localStorage.setItem("margin:view", v);
		setView(v);
	};

	const load = async (fresh = false) => {
		try {
			const d = await api.pr(pr, fresh);
			setData(d);
			setComments(d.comments);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	useEffect(() => {
		void load();
		// Agents comment through the CLI while this page is open; poll the
		// comment file so their findings appear without a reload.
		const iv = setInterval(() => void api.comments(pr).then(setComments, () => {}), 2500);
		return () => clearInterval(iv);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pr]);

	const byFile = useMemo(() => {
		const map = new Map<string, Comment[]>();
		for (const c of comments) {
			const list = map.get(c.path) ?? [];
			list.push(c);
			map.set(c.path, list);
		}
		return map;
	}, [comments]);

	if (error) {
		return (
			<div className="landing">
				<div className="landing-card">
					<div className="brand big">
						<span className="mark" />
						margin
					</div>
					<p className="landing-lede error-text">{error}</p>
					<p className="landing-lede">Is `gh` signed in for this repository?</p>
				</div>
			</div>
		);
	}
	if (!data) return <div className="page-loading">Loading the pull request…</div>;

	const chip = stateChip(data.meta);
	const open = comments.filter((c) => c.status === "open").length;
	const resolved = comments.length - open;
	const scrollTo = (path: string, commentId?: string) => {
		const el = commentId ? document.getElementById(`thread-${commentId}`) : fileRefs.current.get(path);
		el?.scrollIntoView({ behavior: "smooth", block: commentId ? "center" : "start" });
	};

	return (
		<div className="app">
			<header className="topbar">
				<a className="brand" href="/">
					<span className="mark" />
					margin
				</a>
				<span className="pr-name">
					<span className="pr-repo">
						{data.ref.owner}/{data.ref.repo}
					</span>
					<b>#{data.ref.number}</b>
					<span className="pr-title" title={data.meta.title}>
						{data.meta.title}
					</span>
				</span>
				<span className={`state-chip ${chip.cls}`}>{chip.word}</span>
				<span className="spacer" />
				<div className="seg">
					{(["unified", "split"] as DiffView[]).map((v) => (
						<button key={v} type="button" className={view === v ? "on" : ""} onClick={() => pickView(v)}>
							{v === "unified" ? "Unified" : "Split"}
						</button>
					))}
				</div>
				<span className="head-stat">
					<b>{open}</b> open
					{resolved > 0 && (
						<span className="dim">
							{" "}
							· {resolved} resolved
						</span>
					)}
				</span>
				<button
					type="button"
					className="btn ghost icon"
					title="Refetch the diff from GitHub"
					onClick={() => {
						setRefreshing(true);
						void load(true).finally(() => setRefreshing(false));
					}}
				>
					<RefreshCw size={13} className={refreshing ? "spin" : ""} />
				</button>
				<a className="btn ghost icon" href={data.url} target="_blank" rel="noreferrer" title="Open on GitHub">
					<ExternalLink size={13} />
				</a>
				<IdentityMenu />
			</header>

			<div className="main">
				<aside className="side">
					<div className="panel-label">
						Files <span className="dim">{data.files.length}</span>
					</div>
					<FileTree files={data.files} byFile={byFile} onPick={(path) => scrollTo(path)} />
					{comments.length > 0 && (
						<>
							<div className="panel-label">Comments</div>
							<div className="thread-list">
								{[...comments]
									.sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === "open" ? -1 : 1))
									.map((c) => (
										<button
											type="button"
											key={c.id}
											className={`thread-row ${c.status}`}
											onClick={() => scrollTo(c.path, c.id)}
										>
											<span className={`t-dot ${c.status}`} />
											<span className="t-body">{c.body.split("\n")[0]}</span>
											<span className="t-meta">{c.author}</span>
										</button>
									))}
							</div>
						</>
					)}
				</aside>

				<div className="diff-col">
					{data.files.map((f) => (
						<DiffFileCard
							key={f.path}
							file={f}
							pr={pr}
							view={view}
							comments={byFile.get(f.path) ?? []}
							author={author}
							onChanged={setComments}
							refCb={(el) => {
								if (el) fileRefs.current.set(f.path, el);
							}}
						/>
					))}
				</div>
			</div>
			<Toasts />
		</div>
	);
}

export function App() {
	const path = location.pathname.slice(1);
	const ref = path ? parsePrRef(path) : null;
	if (!ref) return (
		<>
			<Landing />
			<Toasts />
		</>
	);
	return <Review pr={`https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`} />;
}
