# margin

Local review comments on GitHub pull requests, for humans and agents.
GitHub stays clean for people; agent findings live here, on your machine,
as plain files.

## The pieces

- **Viewer** (`bun dev`, then `http://localhost:4519/<github-pr-url>`): the
  path is the PR. The page fetches the PR's title and diff through `gh`,
  renders a syntax-highlighted diff per file, and shows every local comment
  inline on its anchor line. Click a line to comment; reply, resolve,
  reopen, and edit in place. The left rail lists files and threads. The
  landing page at `/` lists every PR with local comments.
- **CLI** (`margin`): the same store, for terminals and agents.

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
- **Identity**: every comment and reply carries an author. Humans default
  to `git config user.name` (the web UI remembers a name per browser).
  An agent passes `--author <its-name>` and `--session <id>` (default:
  `$CLAUDE_SESSION_ID`), so each finding points back to the session that
  wrote it — copy the session id in the UI and `claude --resume` it.

## Storage

One JSON file per PR under `~/.margin/comments/<owner>__<repo>__<n>.json`.
Plain files: the CLI and the server never fight, and an agent can read the
store directly. `MARGIN_HOME` moves it; `MARGIN_PORT` moves the server
(default 4519).

## Install

```sh
bun install
bun link        # puts `margin` on PATH
bun dev         # serves http://localhost:4519
```

Needs `gh` signed in for the repositories you review.
