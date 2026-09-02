import { generateManifest } from "material-icon-theme";
import index from "./client/index.html";
import { ensureLiveBranch, getLiveBranch, liveBranchCommand } from "./core/livebranch";
import {
	fetchChecks,
	fetchConversation,
	fetchDiff,
	fetchMeta,
	fetchMyOpenPrs,
	getAutoDeploy,
	parsePrRef,
	resolveReviewCwd,
	runPrAction,
	setAutoDeploy,
	type PrAction,
} from "./core/pr";
import {
	addComment,
	editComment,
	listComments,
	listPrs,
	prKey,
	prUrl,
	reopenComment,
	replyToComment,
	resolveComment,
	type Identity,
} from "./core/store";
import type { DiffFile, PrMeta, PrRef } from "./core/types";

const PORT = Number(process.env.MARGIN_PORT ?? 4519);

/** The diff and title change rarely while a review is open; one minute is fresh enough. */
const CACHE_MS = 60_000;
const prCache = new Map<string, { at: number; meta: PrMeta; files: DiffFile[]; cwd: string | null }>();

/** Meta alone, for the favicon route: cheap enough to keep separately fresh. */
const metaCache = new Map<string, { at: number; meta: PrMeta }>();
async function loadMeta(ref: PrRef): Promise<PrMeta> {
	const key = prKey(ref);
	const hit = metaCache.get(key);
	if (hit && Date.now() - hit.at < CACHE_MS) return hit.meta;
	const meta = await fetchMeta(ref);
	metaCache.set(key, { at: Date.now(), meta });
	return meta;
}

function statusColor(meta: PrMeta): string {
	if (meta.isDraft) return "#8a8f98";
	const s = meta.state.toLowerCase();
	if (s === "merged") return "#a48ff0";
	if (s === "open") return "#22d39a";
	return "#f16682";
}

function prFaviconSvg(color: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="3"/><path d="M5 9v12"/><circle cx="19" cy="18" r="3"/><path d="M15 9l-3-3 3-3"/><path d="M12 6h4a3 3 0 0 1 3 3v6"/></svg>`;
}

async function loadPr(ref: PrRef, fresh: boolean) {
	const key = prKey(ref);
	const hit = prCache.get(key);
	if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit;
	const [meta, files] = await Promise.all([fetchMeta(ref), fetchDiff(ref)]);
	const cwd = await resolveReviewCwd(ref, meta.headRefName);
	const entry = { at: Date.now(), meta, files, cwd };
	prCache.set(key, entry);
	return entry;
}

function refFromQuery(url: URL): PrRef {
	const ref = parsePrRef(url.searchParams.get("pr") ?? "");
	if (!ref) throw new Error("bad ?pr= value");
	return ref;
}

function json(value: unknown, status = 200): Response {
	return Response.json(value, { status });
}

async function body<T>(req: Request): Promise<T> {
	return (await req.json()) as T;
}

function who(input: { author?: string; session?: string }): Identity {
	if (!input.author?.trim()) throw new Error("author is required");
	return { author: input.author.trim(), ...(input.session ? { session: input.session } : {}) };
}

const server = Bun.serve({
	port: PORT,
	idleTimeout: 120,
	// Dev-mode asset serving: bundles go out uncacheable, so an embedding
	// webview never pins a stale stylesheet to a fresh script.
	development: { hmr: false },
	routes: {
		"/api/prs": async () => json(await listPrs()),

		// The same file icons the Canary DE tree uses: material-icon-theme's
		// manifest maps names and extensions to icon files, served from the
		// package itself.
		"/api/file-icons/manifest": () => {
			const m = generateManifest();
			return json({
				fileNames: m.fileNames ?? {},
				fileExtensions: m.fileExtensions ?? {},
				defaultIcon: m.file ?? "file",
			});
		},
		// A stable, status-colored favicon URL per PR: a host app seeds its tab
		// icon with this before the page ever loads.
		"/pr-favicon/:owner/:repo/:number": async (req) => {
			const { owner, repo, number } = req.params;
			const ref = { owner, repo, number: Number(number.replace(/\.svg$/, "")) };
			if (!ref.owner || !ref.repo || !Number.isFinite(ref.number)) {
				return new Response("bad ref", { status: 400 });
			}
			let color = "#8a8f98";
			try {
				color = statusColor(await loadMeta(ref));
			} catch {
				// GitHub unreachable: the neutral glyph still beats a broken image.
			}
			return new Response(prFaviconSvg(color), {
				headers: { "content-type": "image/svg+xml", "cache-control": "max-age=60" },
			});
		},

		"/file-icons/:name": (req) => {
			const name = req.params.name;
			if (!/^[\w.-]+\.svg$/.test(name)) return new Response("bad name", { status: 400 });
			const file = Bun.file(`${import.meta.dir}/../node_modules/material-icon-theme/icons/${name}`);
			return new Response(file, {
				headers: { "content-type": "image/svg+xml", "cache-control": "max-age=3600" },
			});
		},
		"/api/my-prs": async () => {
			try {
				return json(await fetchMyOpenPrs());
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 502);
			}
		},

		"/api/pr": async (req) => {
			const url = new URL(req.url);
			const ref = refFromQuery(url);
			try {
				const { meta, files, cwd } = await loadPr(ref, url.searchParams.get("fresh") === "1");
				return json({ ref, url: prUrl(ref), meta, files, cwd, comments: await listComments(ref) });
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 502);
			}
		},

		"/api/pr/meta": async (req) => {
			try {
				const ref = refFromQuery(new URL(req.url));
				metaCache.delete(prKey(ref));
				return json(await loadMeta(ref));
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 502);
			}
		},

		"/api/pr/conversation": async (req) => {
			try {
				return json(await fetchConversation(refFromQuery(new URL(req.url))));
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 502);
			}
		},

		"/api/pr/checks": async (req) => {
			try {
				return json(await fetchChecks(refFromQuery(new URL(req.url))));
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 502);
			}
		},

		"/api/pr/action": {
			POST: async (req) => {
				const ref = refFromQuery(new URL(req.url));
				const b = await body<{ action: PrAction }>(req);
				try {
					await runPrAction(ref, b.action);
					// The action just changed the PR's state on GitHub; a cached
					// meta would keep the page and the favicon on the old state.
					prCache.delete(prKey(ref));
					metaCache.delete(prKey(ref));
					return json({ ok: true });
				} catch (error) {
					return json({ error: error instanceof Error ? error.message : String(error) }, 502);
				}
			},
		},

		"/api/pr/autodeploy": {
			GET: async (req) => {
				try {
					return json(await getAutoDeploy(refFromQuery(new URL(req.url))));
				} catch (error) {
					return json({ error: error instanceof Error ? error.message : String(error) }, 502);
				}
			},
			POST: async (req) => {
				const ref = refFromQuery(new URL(req.url));
				const b = await body<{ enabled: boolean }>(req);
				try {
					await setAutoDeploy(ref, b.enabled);
					return json({ ok: true });
				} catch (error) {
					return json({ error: error instanceof Error ? error.message : String(error) }, 502);
				}
			},
		},

		"/api/pr/livebranch": {
			GET: async (req) => {
				try {
					return json(await getLiveBranch(refFromQuery(new URL(req.url))));
				} catch (error) {
					return json({ error: error instanceof Error ? error.message : String(error) }, 502);
				}
			},
			POST: async (req) => {
				const ref = refFromQuery(new URL(req.url));
				const b = await body<{ op: "ensure" | "create" | "deploy" | "delete" }>(req);
				try {
					if (b.op === "ensure") return json(await ensureLiveBranch(ref));
					await liveBranchCommand(ref, b.op);
					return json({ posted: true });
				} catch (error) {
					return json({ error: error instanceof Error ? error.message : String(error) }, 502);
				}
			},
		},

		"/api/comments": {
			GET: async (req) => json(await listComments(refFromQuery(new URL(req.url)))),
			POST: async (req) => {
				const ref = refFromQuery(new URL(req.url));
				const b = await body<{
					path: string;
					line: number;
					startLine?: number;
					side?: "old" | "new";
					body: string;
					author?: string;
					session?: string;
				}>(req);
				if (!b.path || !b.line || !b.body?.trim()) return json({ error: "path, line, body are required" }, 400);
				return json(await addComment(ref, b, who(b)));
			},
		},

		"/api/comments/:id": async (req) => {
			if (req.method !== "PATCH") return json({ error: "PATCH only" }, 405);
			const ref = refFromQuery(new URL(req.url));
			const id = req.params.id;
			const b = await body<{ op: "edit" | "resolve" | "reopen"; body?: string; author?: string; session?: string }>(req);
			try {
				if (b.op === "edit") return json(await editComment(ref, id, b.body ?? ""));
				if (b.op === "resolve") return json(await resolveComment(ref, id, who(b)));
				if (b.op === "reopen") return json(await reopenComment(ref, id));
				return json({ error: `unknown op ${b.op}` }, 400);
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 404);
			}
		},

		"/api/comments/:id/replies": {
			POST: async (req) => {
				const ref = refFromQuery(new URL(req.url));
				const b = await body<{ body: string; author?: string; session?: string }>(req);
				if (!b.body?.trim()) return json({ error: "body is required" }, 400);
				try {
					return json(await replyToComment(ref, req.params.id, b.body, who(b)));
				} catch (error) {
					return json({ error: error instanceof Error ? error.message : String(error) }, 404);
				}
			},
		},

		// The path IS the PR: localhost/<github-pr-url> opens the review. The
		// client reads the PR from location.pathname; every other path is the
		// landing page.
		"/*": index,
	},
});

console.log(`margin listening on http://localhost:${server.port}`);
console.log(`open a review: http://localhost:${server.port}/https://github.com/<owner>/<repo>/pull/<n>`);
