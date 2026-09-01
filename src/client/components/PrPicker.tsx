import { ChevronDown, GitPullRequestArrow } from "lucide-react";
import { useState } from "react";
import { api } from "../lib";

type MyPr = { owner: string; repo: string; number: number; title: string; isDraft: boolean };

/**
 * The PR's name in the topbar doubles as a switcher: it lists the signed-in
 * user's open pull requests and jumps between them, keeping the active tab.
 */
export function PrPicker({
	number,
	title,
	stateCls,
}: {
	number: number;
	title: string;
	stateCls: string;
}) {
	const [open, setOpen] = useState(false);
	const [prs, setPrs] = useState<MyPr[] | null>(null);

	const openMenu = () => {
		setOpen(!open);
		if (!open && prs === null) void api.myPrs().then(setPrs, () => setPrs([]));
	};

	return (
		<div className="overflow-wrap pr-pick-wrap">
			<button type="button" className="pr-name pr-pick" onClick={openMenu}>
				<GitPullRequestArrow size={14} className={`pr-state-ico ${stateCls}`} />
				<b>#{number}</b>
				<span className="pr-title" title={title}>
					{title}
				</span>
				<ChevronDown size={12} className="pr-pick-chev" />
			</button>
			{open && (
				<>
					<div className="menu-veil" onClick={() => setOpen(false)} />
					<div className="menu-pop pr-pick-menu">
						{prs === null && <div className="conv-empty">Loading your open PRs…</div>}
						{prs?.length === 0 && <div className="conv-empty">No open PRs.</div>}
						{prs?.map((p) => (
							<a
								key={`${p.owner}/${p.repo}#${p.number}`}
								className={`pr-pick-row ${p.number === number ? "on" : ""}`}
								href={`/https://github.com/${p.owner}/${p.repo}/pull/${p.number}${location.hash}`}
							>
								<GitPullRequestArrow size={13} className={`pr-state-ico ${p.isDraft ? "draft" : "open"}`} />
								<span className="pr-pick-name mono">
									{p.repo}#{p.number}
								</span>
								<span className="pr-pick-title">{p.title}</span>
							</a>
						))}
					</div>
				</>
			)}
		</div>
	);
}
