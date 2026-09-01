import {
	ExternalLink,
	GitPullRequestArrow,
	ListChecks,
	MessageSquare,
	RefreshCw,
	Rocket,
	SquareCheckBig,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveBranchStatus } from "../core/livebranch";
import type { ConversationEntry } from "../core/pr";
import { parsePrRef } from "../core/pr";
import type { CheckRun, Comment } from "../core/types";
import { api, timeAgo, useIdentity, useToasts, type PrPayload } from "./lib";
import { ChecksSection } from "./components/ChecksSection";
import { ConversationTab } from "./components/ConversationTab";
import { DiffFileCard, type DiffView } from "./components/DiffFileCard";
import { FileTree } from "./components/FileTree";
import { HeaderActions } from "./components/HeaderActions";
import { IdentityMenu } from "./components/IdentityMenu";
import { LiveBranchSection } from "./components/LiveBranchSection";
import { ReviewTab } from "./components/ReviewTab";

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

type TabId = "changes" | "review" | "ci" | "conversation" | "live";

const TAB_IDS: TabId[] = ["changes", "review", "ci", "conversation", "live"];

function initialTab(): TabId {
	const fromHash = location.hash.slice(1) as TabId;
	return TAB_IDS.includes(fromHash) ? fromHash : "changes";
}

function Review({ pr }: { pr: string }) {
	const [data, setData] = useState<PrPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [comments, setComments] = useState<Comment[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [tab, setTab] = useState<TabId>(initialTab);
	const [view, setView] = useState<DiffView>(
		(localStorage.getItem("margin:view") as DiffView) === "split" ? "split" : "unified",
	);
	const author = useIdentity((s) => s.author);
	const fileRefs = useRef(new Map<string, HTMLDivElement>());
	const pickView = (v: DiffView) => {
		localStorage.setItem("margin:view", v);
		setView(v);
	};
	const pickTab = (t: TabId) => {
		setTab(t);
		history.replaceState(null, "", `#${t}`);
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

	const [checks, setChecks] = useState<CheckRun[] | null>(null);
	const [liveBranch, setLiveBranch] = useState<LiveBranchStatus | null>(null);
	const [conversation, setConversation] = useState<{ body: string; entries: ConversationEntry[] } | null>(null);
	const loadSide = () => {
		void api.checks(pr).then(setChecks, () => {});
		void api.liveBranch(pr).then(setLiveBranch, () => {});
		void api.conversation(pr).then(setConversation, () => {});
	};

	useEffect(() => {
		void load();
		loadSide();
		// Agents comment through the CLI while this page is open; poll the
		// comment file so their findings appear without a reload. Checks and
		// the conversation change on GitHub's clock, so they poll slowly.
		const iv = setInterval(() => void api.comments(pr).then(setComments, () => {}), 2500);
		const slow = setInterval(loadSide, 45_000);
		return () => {
			clearInterval(iv);
			clearInterval(slow);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pr]);

	// A host app embedding this page as a tab reads the document title;
	// naming the tab after the PR is what makes those tabs manageable.
	useEffect(() => {
		if (data) document.title = `#${data.ref.number} ${data.meta.title}`;
		return () => {
			document.title = "margin — local review";
		};
	}, [data]);

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
	const fails = (checks ?? []).filter((c) => c.bucket === "fail" || c.bucket === "cancel").length;
	const pending = (checks ?? []).filter((c) => c.bucket === "pending").length;
	const scrollTo = (path: string, commentId?: string) => {
		const el = commentId ? document.getElementById(`thread-${commentId}`) : fileRefs.current.get(path);
		el?.scrollIntoView({ behavior: "smooth", block: commentId ? "center" : "start" });
	};

	const tabs: Array<{ id: TabId; word: string; icon: React.ReactNode; badge?: React.ReactNode }> = [
		{
			id: "changes",
			word: "Changes",
			icon: <GitPullRequestArrow size={13} />,
			badge: <span className="tab-badge">{data.files.length}</span>,
		},
		{ id: "review", word: "Review", icon: <SquareCheckBig size={13} /> },
		{
			id: "ci",
			word: "CI",
			icon: <ListChecks size={13} />,
			badge:
				fails > 0 ? (
					<span className="tab-badge fail">{fails}</span>
				) : pending > 0 ? (
					<span className="tab-badge pending">{pending}</span>
				) : undefined,
		},
		{
			id: "conversation",
			word: "Conversation",
			icon: <MessageSquare size={13} />,
			badge: open > 0 ? <span className="tab-badge open">{open}</span> : undefined,
		},
		...(liveBranch?.supported
			? [{ id: "live" as TabId, word: "Live Branch", icon: <Rocket size={13} /> }]
			: []),
	];

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
				<IdentityMenu />
			</header>

			<div className="prheader">
				<HeaderActions pr={pr} isDraft={data.meta.isDraft} onDone={() => void load(true)} />
				<span className="spacer" />
				<span className="pr-branches mono" title={`${data.meta.headRefName} into ${data.meta.baseRefName}`}>
					{data.meta.headRefName} → {data.meta.baseRefName}
				</span>
				<span className="file-delta">
					<em className="plus">+{data.meta.additions}</em>
					<em className="minus">−{data.meta.deletions}</em>
				</span>
				<button
					type="button"
					className="btn ghost icon"
					title="Refetch from GitHub"
					onClick={() => {
						setRefreshing(true);
						loadSide();
						void load(true).finally(() => setRefreshing(false));
					}}
				>
					<RefreshCw size={13} className={refreshing ? "spin" : ""} />
				</button>
				<a className="btn ghost icon" href={data.url} target="_blank" rel="noreferrer" title="Open on GitHub">
					<ExternalLink size={13} />
				</a>
			</div>

			<div className="tabstrip">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						className={`tab ${tab === t.id ? "on" : ""}`}
						onClick={() => pickTab(t.id)}
					>
						{t.icon}
						{t.word}
						{t.badge}
					</button>
				))}
				<span className="spacer" />
				{tab === "changes" && (
					<div className="seg">
						{(["unified", "split"] as DiffView[]).map((v) => (
							<button key={v} type="button" className={view === v ? "on" : ""} onClick={() => pickView(v)}>
								{v === "unified" ? "Unified" : "Split"}
							</button>
						))}
					</div>
				)}
			</div>

			{tab === "changes" && (
				<div className="main">
					<aside className="side">
						<div className="panel-label">
							Files <span className="dim">{data.files.length}</span>
						</div>
						<FileTree files={data.files} byFile={byFile} onPick={(path) => scrollTo(path)} />
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
			)}

			{tab === "review" && <ReviewTab pr={pr} />}

			{tab === "ci" && (
				<div className="tabpage">
					<div className="tabpage-card">
						<ChecksSection checks={checks} />
						{(checks ?? []).length === 0 && <p className="conv-empty">No checks reported.</p>}
					</div>
				</div>
			)}

			{tab === "conversation" && (
				<div className="tabpage wide">
					<ConversationTab
						pr={pr}
						description={conversation?.body ?? null}
						entries={conversation?.entries ?? null}
						comments={comments}
						onChanged={setComments}
						onJump={(c) => {
							pickTab("changes");
							setTimeout(() => scrollTo(c.path, c.id), 60);
						}}
					/>
				</div>
			)}

			{tab === "live" && (
				<div className="tabpage">
					<div className="tabpage-card">
						<LiveBranchSection pr={pr} status={liveBranch} onChanged={loadSide} />
					</div>
				</div>
			)}

			<Toasts />
		</div>
	);
}

export function App() {
	const path = location.pathname.slice(1);
	const ref = path ? parsePrRef(path) : null;
	if (!ref)
		return (
			<>
				<Landing />
				<Toasts />
			</>
		);
	return <Review pr={`https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`} />;
}
