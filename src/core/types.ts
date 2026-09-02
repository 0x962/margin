/** A pull request, named by its GitHub coordinates. */
export interface PrRef {
	owner: string;
	repo: string;
	number: number;
}

export interface Reply {
	id: string;
	author: string;
	/** The agent session the author wrote this from, for `claude --resume`. */
	session?: string;
	body: string;
	createdAt: string;
}

export interface Comment {
	id: string;
	path: string;
	/** Which side of the diff the anchor line lives on. */
	side: "old" | "new";
	line: number;
	/** First line of a multi-line anchor; the anchor is startLine..line. */
	startLine?: number;
	body: string;
	author: string;
	/** The agent session the author wrote this from, for `claude --resume`. */
	session?: string;
	status: "open" | "resolved";
	createdAt: string;
	updatedAt: string;
	resolvedBy?: string;
	resolvedAt?: string;
	replies: Reply[];
}

/** One PR's local comment file, the unit of storage. */
export interface CommentFile {
	url: string;
	comments: Comment[];
}

export interface PrMeta {
	title: string;
	state: string;
	isDraft: boolean;
	author: string;
	headRefName: string;
	baseRefName: string;
	additions: number;
	deletions: number;
	changedFiles: number;
	/** MERGEABLE | CONFLICTING | UNKNOWN, GitHub's own words. */
	mergeable: string;
	/** Set while auto-merge is armed on GitHub; null otherwise. */
	autoMergeRequest: { enabledAt?: string } | null;
	/** Set while the PR sits in the repository's merge queue; null otherwise. */
	mergeQueueEntry: { position: number | null; enqueuedAt?: string } | null;
	/** The gh stack this PR belongs to, base first; null when unstacked. */
	stack: StackEntry[] | null;
}

/** One PR in a gh stack, as the stack strip renders it. */
export interface StackEntry {
	position: number;
	number: number;
	title: string;
	/** OPEN | MERGED | CLOSED, GitHub's own words. */
	state: string;
	isDraft: boolean;
	url: string;
	/** True for the PR the page shows. */
	current: boolean;
}

export interface CheckRun {
	name: string;
	workflow: string;
	/** pass | fail | pending | skipping | cancel, GitHub's own buckets. */
	bucket: string;
	link: string;
}

export interface DiffLine {
	type: "context" | "add" | "del";
	old: number | null;
	new: number | null;
	text: string;
}

export interface DiffHunk {
	/** The @@ ranges, e.g. "-1,4 +1,5". */
	range: string;
	/** The context git prints after the second @@, often a function name. */
	header: string;
	lines: DiffLine[];
}

export interface DiffFile {
	path: string;
	oldPath: string;
	status: "added" | "deleted" | "renamed" | "modified";
	binary: boolean;
	additions: number;
	deletions: number;
	hunks: DiffHunk[];
}
