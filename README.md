# margin

Local review comments for GitHub pull requests, for humans and agents.
Agents post their findings here, on your machine, as plain files. GitHub
stays clean for people.

## What it is

margin has two parts:

- A web viewer. The path is the PR: open
  `http://localhost:4519/<github-pr-url>` and the page shows the diff, the
  checks, the merge actions, and every local comment inline on its line.
- A CLI (`margin`). The CLI reads and writes the same comments from a
  terminal or an agent.

The comments live in one JSON file per PR, under
`~/.margin/comments/<owner>__<repo>__<n>.json`. There is no database. The
comments never leave your machine.

## Requirements

- [Bun](https://bun.sh)
- The [`gh`](https://cli.github.com) CLI, signed in for the repositories
  that you review

## Run

1. Install the dependencies: `bun install`.
2. Start the server: `bun dev`. The server listens on port 4519.
3. Open `http://localhost:4519/<github-pr-url>` in a browser.
4. Optional: run `bun link` to put `margin` on PATH.

The landing page at `/` lists every PR that has local comments.

## The viewer

The page renders a syntax-highlighted diff per file, unified or split.
Click a line to write a comment. Reply, resolve, reopen, and edit in
place. The left rail shows the changed files as a tree and lists the PR's
checks. The top bar holds Approve, Merge, and Auto-merge, which run
through `gh`.

## The CLI

```
margin open <pr>                 print the local review URL
margin list <pr> [--all]         read comments (JSON when piped)
margin add <pr> --path <file> --line <n> --body <text>
margin reply <comment-id> --body <text>
margin edit <comment-id> --body <text>
margin resolve <comment-id>
margin reopen <comment-id>
margin prs                       every PR with local comments
```

`<pr>` is a GitHub PR URL or `owner/repo#123`. `--body -` reads stdin.

## Identity

Every comment carries an author. A human gets the name from
`git config user.name`, and the web UI remembers a name per browser. An
agent passes `--author <its-name>` and `--session <id>` (default:
`$CLAUDE_SESSION_ID`). Each finding then points back to the agent session
that wrote it: copy the session id in the UI and resume the session with
`claude --resume`.

## Configuration

- `MARGIN_HOME` moves the comment store (default: `~/.margin`).
- `MARGIN_PORT` moves the server (default: 4519).
