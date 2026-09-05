import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";
import { imageProxyPath } from "../../core/image";

marked.setOptions({ gfm: true, breaks: false });

// A picture in a pull request body sits on github.com behind a GitHub login,
// and the browser sends no GitHub cookie to another site, so the file comes
// back 404 and the person sees a broken image. Point those <img> tags at
// margin's own /api/image, which fetches the file with the person's GitHub
// token. imageProxyPath answers null for every other address, and that
// address stays as the author wrote it.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
	if (node.nodeName !== "IMG") return;
	const proxied = imageProxyPath(node.getAttribute("src") ?? "");
	if (proxied) node.setAttribute("src", proxied);
});

export function Markdown({ text, className }: { text: string; className?: string }) {
	const html = useMemo(
		() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string),
		[text],
	);
	return <div className={`md ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
