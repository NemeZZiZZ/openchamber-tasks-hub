# Tasks Hub — one task board for OpenChamber

[![Check](https://github.com/NemeZZiZZ/openchamber-tasks-hub/actions/workflows/check.yml/badge.svg)](https://github.com/NemeZZiZZ/openchamber-tasks-hub/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-6cc644.svg)](LICENSE)
[![OpenChamber](https://img.shields.io/badge/OpenChamber-%E2%89%A5%202.7.1-7c3aed.svg)](#install)
[![Sources](https://img.shields.io/badge/sources-6-0969da.svg)](#supported-sources)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6.svg)](#develop)

Your issues from **GitHub**, **GitLab** (including self-hosted), **Trello**, **Linear** and **Jira**, plus local todos, on one board inside OpenChamber — and each task can be linked to a real OpenCode agent session. Move a card and the remote issue moves too; start an agent on a task and the card tells you when the agent needs you.

- **Table or board** — one task set, two views. The list view is a table on wide screens and a stack of cards on narrow ones; the board is GitLab-style columns you can collapse into a strip and drag to reorder.
- **Board like GitHub/GitLab** — group by status, label, assignee or milestone. Label grouping works like a GitLab issue board: *Open* · one column per label you add · *Closed*; moving a card adds and removes the labels.
- **Filters** — search, source, project, assignee, label, author and open/closed. Everything persists across reloads.
- **Rich cards** — labels, due date (overdue in red), milestone, comment count, checklist progress (`3/5`), assignee and source; a ⋯ menu to close/reopen, open in the browser, copy the link, start an agent or open its chat.
- **Create where you look** — the **+** in a column head creates a real issue in that column (with its label or status).
- **Two-way sync** — edits, moves, close and reopen go back to the remote system. A failed write stays visible on the card with a Retry; nothing diverges silently.
- **Agent linkage** — **Start agent** opens an OpenCode session for the task in the matching project; a badge appears when the agent waits on a question or a permission, or finishes a turn. Agent activity never moves cards on the remote board.
- **Tokens stay home** — credentials live in the extension's service process only, each token goes only to its own host, and the panel never sees one.

Requires OpenChamber 2.7.1 or newer (desktop or web).

## Supported sources

| | GitHub | GitLab | Trello | Linear | Jira | Local |
|---|---|---|---|---|---|---|
| List, edit title/description | ✅ issues | ✅ issues + work items | ✅ cards | ✅ issues | ✅ issues | ✅ |
| Columns | open / done | label lists + done | board lists | workflow states | statuses | 5 statuses |
| Create | ✅ toolbar or column + | ✅ toolbar or column + | ✅ toolbar or column + | ✅ toolbar or column + | ✅ toolbar or column + | ✅ |
| Edit fields | title, desc, labels, assignee, milestone | title, desc, labels, assignee, milestone, due date | title, desc, labels, members, due date | title, desc, labels, assignee, due date | title, desc, labels, assignee, due date | title, desc, labels |
| Delete | — (close instead) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Close / reopen | ✅ | ✅ | — | via state | via status | ✅ |
| Self-hosted | — | ✅ | — | — | Cloud site | — |
| Credentials | OpenChamber account, card token, `gh` | OpenChamber account, card token, `glab` | key + token | API key | email + API token | none |

Label-column moves still work for GitHub, GitLab, Trello and Jira; Linear
label edits now work via the edit dialog.

Pull requests and merge requests are not shown.

## Install

The package is not in a catalog yet. Clone the repository, run the check once (installs, typechecks, tests and builds `panel/*.js` and `service/main.js`), then add the folder in OpenChamber: **Settings → Extensions → Add** — or open an `openchamber://extensions/install?path=…` link pointing at the checkout. Approve the capability grant.

```sh
git clone https://github.com/NemeZZiZZ/openchamber-tasks-hub.git
cd openchamber-tasks-hub
npm install
npm run check
```

## Surfaces

- **Page "Tasks Hub"** (sidebar → Extension pages) — the full board: toolbar with search, view switch, source and project, filters, grouping and the *Mine only / Show all* scope.
- **Rail panel "Tasks Hub"** — counts (open, total, needs attention), per-column counts, the tasks that need your attention (click opens the agent's chat) and source health.

Both open on the last list they showed and refresh in the background.

## Which tasks show up

- **`repos` setting empty (default)** — the repositories behind the projects open in OpenChamber (their `git remote -v`). By default only issues **assigned to you** are shown; the **Show all** toggle lists every issue of those repositories.
- **`repos` set** — exactly those repositories and boards, comma separated: `github:owner/name`, `gitlab:host/group/project`, `trello:<boardId>`, `linear:<teamKey>`, `jira:<site>/<projectKey>`.

The source filter offers only sources that have credentials (or already have tasks).

## Account

For GitHub and GitLab the service looks for a token in this order, per host:

1. The account connected in OpenChamber (`~/.config/openchamber/source-control-auth.json`), including self-hosted GitLab servers.
2. The token pasted on the Tasks Hub card (Settings → Extensions). A pasted GitHub token goes to github.com only; a pasted GitLab token goes to gitlab.com or the server set in `gitlab-server` — never to a lookalike host.
3. `gh auth token` / `glab auth token` from the CLI.

Scopes: GitHub `repo`; GitLab `read_api` to watch, `api` to write. Trello, Linear and Jira take their credentials from the card only:

| Setting | Meaning |
|---|---|
| `github-token` | GitHub personal access token |
| `gitlab-token`, `gitlab-server` | gitlab.com token; self-hosted server URL (its token comes from OpenChamber or the CLI, or this field) |
| `repos` | explicit repositories and boards (see above) |
| `trello-key`, `trello-token` | Trello API key and the token generated for it |
| `linear-token` | Linear API key |
| `jira-host`, `jira-email`, `jira-token` | Jira Cloud site, account email, API token |

Label-column moves apply to GitHub, GitLab, Trello and Jira. Linear has
no label moves: the board reports them as an unsupported error instead of
pretending they worked.

## Board semantics

- **Done closes, leaving Done reopens.** Labels outside the column mapping are preserved; on GitLab a move adds and removes the list label.
- **Last writer wins.** A failed write-back shows `sync error` with the message and a Retry; it is never dropped silently.
- **Delete is real.** Deleting a task removes it at the source (GitLab issue, Trello card, Linear issue, Jira issue, local record) after a confirmation. GitHub does not allow deleting issues via the API, so GitHub cards offer Close instead. Deleting a card does not touch any linked agent session.
- **Links are local.** Session links, card order and the attention badge live in the extension's own store, never in the remote system. Deleting a linked session deletes a *local* task; for a remote task it only clears the link.
- **Start agent without a checkout** asks which project to use; nothing is cloned.
- Assignee and milestone grouping are read-only (no drag, no **+**).

## Develop

```sh
npm install
npm run check     # tsc --noEmit, node --test, esbuild bundles
npx openchamber-guest-check
```

Try the service alone:

```sh
OPENCHAMBER_SERVICE_PORT=4599 OPENCHAMBER_SERVICE_TOKEN=t node service/main.js &
curl -H 'Authorization: Bearer t' localhost:4599/health
```

```
package.json          manifest (openchamber key)
panel/                index.html (rail), page.html (board); built main.js / page.js
service/main.ts       → main.js (Node bundle), the only process holding a token
src/domain            pure model: UnifiedTask, list mapping, checklist, attention, remotes
src/adapters          TaskAdapter contract (types.ts), registry (index.ts), one file per source
src/service           auth, file store, engine (cache, coalescing, write-back), routes
src/host              panel-side wiring: service client, session linkage, workspace discovery
src/store             panel prefs and list cache
src/ui                shell, table, board, detail, create, modal, styles
test/                 node:test suites
```

Adding a source means one file implementing `TaskAdapter`, a `registerAdapter` call in `src/adapters/index.ts` and its settings in the manifest — no UI or protocol change. See [ARCHITECTURE.md](ARCHITECTURE.md).

The service keeps local tasks, links and its cache in `tasks-store.json` in the service data folder (`OPENCHAMBER_SERVICE_DATA_DIR`, else `~/.openchamber-tasks`).

## Known limits

- Each repository, board or project reads its 100 most recently updated issues (no paging yet).
- One manual GitLab server on the card (OpenChamber-connected accounts cover any number of hosts).
- Sessions without a project (chats) cannot be linked.
- No offline queue: writes need the remote system to be reachable.

## License

[MIT](LICENSE) © NemeZZiZZ
