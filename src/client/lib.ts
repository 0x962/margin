import { create } from "zustand";
import type { LiveBranchStatus } from "../core/livebranch";
import type { PrAction } from "../core/pr";
import type { CheckRun, Comment, DiffFile, PrMeta, PrRef } from "../core/types";

export interface PrPayload {
	ref: PrRef;
	url: string;
	meta: PrMeta;
	files: DiffFile[];
	comments: Comment[];
	error?: string;
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	const data = (await res.json()) as T & { error?: string };
	if (!res.ok) throw new Error(data.error ?? `${res.status} on ${url}`);
	return data;
}

const post = (payload: unknown, method = "POST"): RequestInit => ({
	method,
	headers: { "content-type": "application/json" },
	body: JSON.stringify(payload),
});

export const api = {
	prs: () =>
		j<Array<{ ref: PrRef; url: string; open: number; resolved: number; updatedAt: string }>>("/api/prs"),
	pr: (pr: string, fresh = false) =>
		j<PrPayload>(`/api/pr?pr=${encodeURIComponent(pr)}${fresh ? "&fresh=1" : ""}`),
	comments: (pr: string) => j<Comment[]>(`/api/comments?pr=${encodeURIComponent(pr)}`),
	add: (pr: string, input: object) => j<Comment>(`/api/comments?pr=${encodeURIComponent(pr)}`, post(input)),
	patch: (pr: string, id: string, input: object) =>
		j<Comment>(`/api/comments/${id}?pr=${encodeURIComponent(pr)}`, post(input, "PATCH")),
	reply: (pr: string, id: string, input: object) =>
		j<Comment>(`/api/comments/${id}/replies?pr=${encodeURIComponent(pr)}`, post(input)),
	checks: (pr: string) => j<CheckRun[]>(`/api/pr/checks?pr=${encodeURIComponent(pr)}`),
	action: (pr: string, action: PrAction) =>
		j<{ ok: boolean }>(`/api/pr/action?pr=${encodeURIComponent(pr)}`, post({ action })),
	liveBranch: (pr: string) => j<LiveBranchStatus>(`/api/pr/livebranch?pr=${encodeURIComponent(pr)}`),
	liveBranchOp: (pr: string, op: "ensure" | "create" | "deploy" | "delete") =>
		j<{ action?: string; posted?: boolean }>(`/api/pr/livebranch?pr=${encodeURIComponent(pr)}`, post({ op })),
};

/** The reviewer's name, kept in the browser; agents identify through the CLI. */
export const useIdentity = create<{ author: string; set: (name: string) => void }>((set) => ({
	author: localStorage.getItem("margin:author") ?? "",
	set: (author) => {
		localStorage.setItem("margin:author", author);
		set({ author });
	},
}));

export function timeAgo(iso: string): string {
	const s = (Date.now() - Date.parse(iso)) / 1000;
	if (s < 60) return "now";
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}

export interface Toast {
	id: number;
	text: string;
	kind: "info" | "error";
}

let seq = 0;
export const useToasts = create<{ toasts: Toast[]; push: (text: string, kind?: Toast["kind"]) => void }>(
	(set) => ({
		toasts: [],
		push: (text, kind = "info") => {
			const id = ++seq;
			set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
			setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
		},
	}),
);
export const toast = (text: string, kind: Toast["kind"] = "info") => useToasts.getState().push(text, kind);
