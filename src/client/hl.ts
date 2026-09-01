import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const BY_EXT: Record<string, string> = {
	sh: "bash",
	zsh: "bash",
	css: "css",
	scss: "css",
	go: "go",
	java: "java",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	kt: "kotlin",
	md: "markdown",
	py: "python",
	rb: "ruby",
	rs: "rust",
	sql: "sql",
	swift: "swift",
	ts: "typescript",
	tsx: "typescript",
	html: "xml",
	svg: "xml",
	xml: "xml",
	yml: "yaml",
	yaml: "yaml",
};

export function languageOf(path: string): string | null {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	return BY_EXT[ext] ?? null;
}

/**
 * One diff line at a time: multi-line constructs (block comments, template
 * strings) lose their state, which is the standard trade-off in diff viewers.
 */
export function highlightLine(text: string, language: string | null): string {
	if (!language) return escapeHtml(text);
	try {
		return hljs.highlight(text, { language, ignoreIllegals: true }).value;
	} catch {
		return escapeHtml(text);
	}
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
