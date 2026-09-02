import {
	CheckCheck,
	CloudDownload,
	GitCompareArrows,
	GitMerge,
	GitPullRequestArrow,
	ListChecks,
	LoaderCircle,
	MessageSquare,
	Rocket,
	TriangleAlert,
	X,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveBranchStatus } from "../core/livebranch";
import type { ConversationEntry } from "../core/pr";
import { parsePrRef } from "../core/pr";
import type { CheckRun, Comment, PrMeta } from "../core/types";
import { api, timeAgo, useIdentity, useToasts, type PrPayload } from "./lib";
import { ChecksSection, checksSummary } from "./components/ChecksSection";
import { ConversationTab } from "./components/ConversationTab";
import { DiffFileCard, type DiffView } from "./components/DiffFileCard";
import { FileTree } from "./components/FileTree";
import { HeaderActions } from "./components/HeaderActions";
import { IdentityMenu } from "./components/IdentityMenu";
import { LiveBranchSection } from "./components/LiveBranchSection";
import { PrPicker } from "./components/PrPicker";
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

	const patchMeta = (patch: Partial<PrMeta>) => {
		setData((d) => (d ? { ...d, meta: { ...d.meta, ...patch } } : d));
	};

	// A merge was just requested. The page already shows merged; poll GitHub
	// until it agrees before overwriting local state, so a refetch that races
	// the merge cannot flip the page back to open.
	const confirmMerged = async () => {
		for (let i = 0; i < 6; i++) {
			try {
				const m = await api.meta(pr);
				if (m.state.toLowerCase() !== "open") {
					patchMeta(m);
					void load(true);
					return;
				}
			} catch {
				// gh hiccup; keep polling
			}
			await new Promise((r) => setTimeout(r, 1500));
		}
		void load(true);
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

	// While auto-merge is armed, GitHub merges on its own clock; watch the
	// meta so the header flips to Merged without a manual refresh.
	const autoMergeArmed =
		!!(data?.meta.autoMergeRequest || data?.meta.mergeQueueEntry) &&
		data.meta.state.toLowerCase() === "open";
	useEffect(() => {
		if (!autoMergeArmed) return;
		const iv = setInterval(() => {
			void api.meta(pr).then((m) => {
				patchMeta(m);
				if (m.state.toLowerCase() !== "open") void load(true);
			}, () => {});
		}, 10_000);
		return () => clearInterval(iv);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoMergeArmed, pr]);

	// The pod claim finishes within a minute, so the wait state polls fast.
	useEffect(() => {
		if (!liveBranch?.supported || !liveBranch.enabled || liveBranch.pod) return;
		const fast = setInterval(() => void api.liveBranch(pr).then(setLiveBranch, () => {}), 10_000);
		return () => clearInterval(fast);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pr, liveBranch?.supported, liveBranch?.enabled, liveBranch?.pod]);

	// A host app embedding this page as a tab reads the document title and
	// favicon: the tab is the PR number, and the icon carries its status,
	// served from the stable per-PR favicon URL so every surface agrees.
	useEffect(() => {
		if (!data) return;
		document.title = `#${data.ref.number}`;
		const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
		const prev = link?.href ?? null;
		if (link) link.href = `/pr-favicon/${data.ref.owner}/${data.ref.repo}/${data.ref.number}.svg`;
		return () => {
			document.title = "margin — local review";
			if (link && prev) link.href = prev;
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

	const open = comments.filter((c) => c.status === "open").length;
	const ci = checksSummary(checks);
	const conflicting = data.meta.mergeable === "CONFLICTING";
	const convCount = (conversation?.entries.length ?? 0) + open;
	const scrollTo = (path: string, commentId?: string) => {
		const el = commentId ? document.getElementById(`thread-${commentId}`) : fileRefs.current.get(path);
		el?.scrollIntoView({ behavior: "smooth", block: commentId ? "center" : "start" });
	};

	const ciIcon =
		ci.fails > 0 ? (
			<X size={14} className="ci-ico fail" />
		) : ci.pending > 0 ? (
			<LoaderCircle size={14} className="ci-ico pending spin-slow" />
		) : ci.total > 0 ? (
			<CheckCheck size={14} className="ci-ico pass" />
		) : (
			<CheckCheck size={14} />
		);

	const tabs: Array<{ id: TabId; word: string; icon: React.ReactNode; badge?: React.ReactNode }> = [
		{
			id: "changes",
			word: "Changes",
			icon: <GitCompareArrows size={14} />,
			badge: <span className="tab-badge">{data.files.length}</span>,
		},
		{ id: "review", word: "Review", icon: <ListChecks size={14} /> },
		{
			id: "ci",
			word: "CI",
			icon: ciIcon,
			badge:
				ci.fails > 0 ? (
					<span className="tab-badge fail">{ci.fails}</span>
				) : ci.pending > 0 ? (
					<span className="tab-badge pending">
						{ci.passed}/{ci.total}
					</span>
				) : undefined,
		},
		{
			id: "conversation",
			word: "Conversation",
			icon: <MessageSquare size={14} />,
			badge: convCount > 0 ? <span className="tab-badge">{convCount}</span> : undefined,
		},
		...(liveBranch?.supported
			? [
					{
						id: "live" as TabId,
						word: "Live Branch",
						icon: <Rocket size={14} className={liveBranch.pod?.state === "ready" ? "ci-ico pass" : ""} />,
					},
				]
			: []),
	];

	return (
		<div className="app">
			<header className="topbar">
				<a className="brand" href="/">
					<span className="mark" />
					margin
				</a>
				<span className="pr-name center">
					<b>#{data.ref.number}</b>
					<span className="pr-title" title={data.meta.title}>
						{data.meta.title}
					</span>
				</span>
				<span className="spacer" />
				<IdentityMenu />
			</header>

			{conflicting && (
				<div className="conflict-banner">
					<TriangleAlert size={14} />
					This branch has conflicts with the base branch.
					<span className="spacer" />
					<a className="btn sm" href={`${data.url}/conflicts`} target="_blank" rel="noreferrer">
						<GitMerge size={12} /> Fix conflicts
					</a>
				</div>
			)}

			{data.meta.stack && (
				<div className="stack-strip">
					<span className="stack-label">Stack</span>
					{data.meta.stack.map((e) => (
						<a
							key={e.number}
							className={`stack-pill ${e.state.toLowerCase()}${e.current ? " on" : ""}`}
							href={`/${e.url}`}
							title={e.title}
						>
							{e.state === "MERGED" ? "✓" : e.state === "CLOSED" ? "✕" : e.isDraft ? "◌" : "○"}{" "}
							#{e.number} <span className="stack-title">{e.title}</span>
						</a>
					))}
				</div>
			)}
			<div className="prheader">
				<PrPicker number={data.ref.number} state={data.meta.state} isDraft={data.meta.isDraft} />
				{data.meta.state.toLowerCase() === "open" ? (
					<HeaderActions
						pr={pr}
						meta={data.meta}
						conflicting={conflicting}
						onPatch={patchMeta}
						onMerged={() => void confirmMerged()}
					/>
				) : (
					<span className={`btn state-pill ${data.meta.state.toLowerCase()}`}>
						<GitMerge size={13} /> {data.meta.state.toLowerCase() === "merged" ? "Merged" : "Closed"}
					</span>
				)}
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
					title="Pull the latest from GitHub"
					onClick={() => {
						setRefreshing(true);
						loadSide();
						void load(true).finally(() => setRefreshing(false));
					}}
				>
					{refreshing ? <LoaderCircle size={14} className="spin" /> : <CloudDownload size={14} />}
				</button>
				<a className="btn ghost icon" href={data.url} target="_blank" rel="noreferrer" title="Open on GitHub">
					<SiGithub size={13} />
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

			{tab === "review" && <ReviewTab pr={pr} cwd={data.cwd} />}

			{tab === "ci" && (
				<div className="tabfull">
					<ChecksSection checks={checks} />
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
				<div className="tabfull">
					<LiveBranchSection pr={pr} status={liveBranch} onChanged={loadSide} />
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
