/**
 * The dots run board, embedded. Dots pins its embed view to one target, so
 * the frame shows only this PR's review runs; New run starts one against it.
 */
export function ReviewTab({ pr, cwd }: { pr: string; cwd: string | null }) {
	const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	// The New run dialog comes prefilled with the PR branch's worktree; the
	// field stays editable in dots.
	const cwdParam = cwd ? `&cwd=${encodeURIComponent(cwd)}` : "";
	const src = `http://dots.localhost/runs?embed=1&theme=${dark ? "dark" : "light"}&target=${encodeURIComponent(pr)}${cwdParam}`;
	return <iframe className="review-frame" src={src} title="dots review runs" />;
}
