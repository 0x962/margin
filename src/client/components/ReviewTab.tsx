/**
 * The dots run board, embedded. Dots pins its embed view to one target, so
 * the frame shows only this PR's review runs; New run starts one against it.
 */
export function ReviewTab({ pr }: { pr: string }) {
	const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const src = `http://dots.localhost/runs?embed=1&theme=${dark ? "dark" : "light"}&target=${encodeURIComponent(pr)}`;
	return <iframe className="review-frame" src={src} title="dots review runs" />;
}
