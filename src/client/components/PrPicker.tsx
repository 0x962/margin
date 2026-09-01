import { ChevronDown, GitPullRequestArrow, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib";

type MyPr = { owner: string; repo: string; number: number; title: string; isDraft: boolean };

/**
 * A switcher over the signed-in user's open pull requests: searchable,
 * grouped by repository, jumping between reviews with the active tab kept.
 */
export function PrPicker({ number }: { number: number }) {
	const [open, setOpen] = useState(false);
	const [prs, setPrs] = useState<MyPr[] | null>(null);
	const [query, setQuery] = useState("");

	const openMenu = () => {
		setOpen(!open);
		setQuery("");
		if (!open && prs === null) void api.myPrs().then(setPrs, () => setPrs([]));
	};

	const groups = useMemo(() => {
		const q = query.trim().toLowerCase();
		const hit = (p: MyPr) =>
			!q ||
			p.title.toLowerCase().includes(q) ||
			`${p.repo}#${p.number}`.toLowerCase().includes(q) ||
			String(p.number).includes(q);
		const byRepo = new Map<string, MyPr[]>();
		for (const p of prs ?? []) {
			if (!hit(p)) continue;
			const key = `${p.owner}/${p.repo}`;
			const list = byRepo.get(key) ?? [];
			list.push(p);
			byRepo.set(key, list);
		}
		return [...byRepo.entries()].sort((a, b) => b[1].length - a[1].length);
	}, [prs, query]);

	return (
		<div className="overflow-wrap">
			<button type="button" className="btn pr-pick" onClick={openMenu}>
				<GitPullRequestArrow size={13} className="pr-state-ico open" />
				#{number}
				<ChevronDown size={12} className="pr-pick-chev" />
			</button>
			{open && (
				<>
					<div className="menu-veil" onClick={() => setOpen(false)} />
					<div className="menu-pop pr-pick-menu">
						<div className="pr-pick-search">
							<Search size={13} />
							<input
								autoFocus
								placeholder="Search your open PRs…"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
							/>
						</div>
						{prs === null && <div className="conv-empty">Loading your open PRs…</div>}
						{prs !== null && groups.length === 0 && <div className="conv-empty">No matches.</div>}
						{groups.map(([repo, list]) => (
							<div key={repo}>
								<div className="pr-pick-repo">{repo}</div>
								{list.map((p) => (
									<a
										key={p.number}
										className={`pr-pick-row ${p.number === number ? "on" : ""}`}
										href={`/https://github.com/${p.owner}/${p.repo}/pull/${p.number}${location.hash}`}
									>
										<GitPullRequestArrow
											size={13}
											className={`pr-state-ico ${p.isDraft ? "draft" : "open"}`}
										/>
										<span className="pr-pick-name mono">#{p.number}</span>
										<span className="pr-pick-title">{p.title}</span>
									</a>
								))}
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
