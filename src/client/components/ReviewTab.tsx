/**
 * The dots run board, embedded. Dots pins its embed view to one target, so
 * the frame shows only this PR's review runs; New run starts one against it.
 */
export function ReviewTab({ pr, repo }: { pr: string; repo: string }) {
	const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	// The New run dialog prefills the checkout by convention; the field stays
	// editable in dots for the odd repo that lives elsewhere.
	const cwd = `~/projects/${repo}`;
	const src = `http://dots.localhost/runs?embed=1&theme=${dark ? "dark" : "light"}&target=${encodeURIComponent(pr)}&cwd=${encodeURIComponent(cwd)}`;
	return <iframe className="review-frame" src={src} title="dots review runs" />;
}
