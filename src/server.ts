import index from "./client/index.html";
import { ensureLiveBranch, getLiveBranch, liveBranchCommand } from "./core/livebranch";
import {
	fetchChecks,
	fetchConversation,
	fetchDiff,
	fetchMeta,
	getAutoDeploy,
	parsePrRef,
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
const prCache = new Map<string, { at: number; meta: PrMeta; files: DiffFile[] }>();

async function loadPr(ref: PrRef, fresh: boolean) {
	const key = prKey(ref);
	const hit = prCache.get(key);
	if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit;
	const [meta, files] = await Promise.all([fetchMeta(ref), fetchDiff(ref)]);
	const entry = { at: Date.now(), meta, files };
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
	routes: {
		"/api/prs": async () => json(await listPrs()),

		"/api/pr": async (req) => {
			const url = new URL(req.url);
			const ref = refFromQuery(url);
			try {
				const { meta, files } = await loadPr(ref, url.searchParams.get("fresh") === "1");
				return json({ ref, url: prUrl(ref), meta, files, comments: await listComments(ref) });
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
