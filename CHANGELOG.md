# Changelog

All notable changes to Tasks Hub are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-11-18

The first public release.

### Added

- **One board for six sources.** GitHub issues, GitLab issues and work items
  (gitlab.com and self-hosted), Trello cards, Linear issues, Jira issues and
  local todos behind one `TaskAdapter` contract. Pull and merge requests are
  not shown.
- **Page "Tasks Hub"** with a list view (table on wide screens, stacked cards
  on narrow ones) and a board view over the same task set.
- **GitLab-style board.** Columns are the source's own lists; they collapse
  into a vertical strip and drag to reorder, both persisted. Group by status,
  label, assignee or milestone. Label grouping is an issue board: *Open* ·
  one column per added label · *Closed*; moving a card adds and removes the
  labels. Assignee and milestone grouping are read-only.
- **Filters** for search, source, project, assignee, label, author and
  open/closed, plus *Hide empty* and *Hide closed* toggles. All persist.
- **Rich cards**: labels, due date (overdue in red), milestone, comment
  count, checklist progress, assignee, source, and a ⋯ menu with
  Close/Reopen, Open in browser, Copy link, Start agent and Open chat.
- **Create in a column.** The **+** in a column head creates a real issue
  with that column's label or status.
- **Two-way sync.** Title and description edits, moves, close and reopen are
  written back; Done closes and leaving Done reopens, other labels are kept.
  A failed write stays visible as `sync error` with a Retry.
- **Agent linkage.** Start agent opens an OpenCode session for the task in the
  project whose repository matches (or asks which project to use; nothing is
  cloned). An attention badge appears when the agent waits on a question or a
  permission or finishes a turn; it never moves cards. Deleting a linked
  session deletes a local task and only unlinks a remote one.
- **Discovery.** With no `repos` setting the board reads the repositories of
  the projects open in OpenChamber, assigned-to-you by default, with a
  *Mine only / Show all* toggle.
- **Rail panel** with open/total/attention counts, per-column counts, the
  tasks that need attention and source health.
- **Instant first paint.** The page and the panel show the last list from a
  local cache, then refresh in the background; a service error keeps the
  saved list on screen.
- **Credentials** for GitHub and GitLab from the OpenChamber-connected
  account, the extension card, or the `gh` / `glab` CLI, per host; pasted
  tokens never go to a lookalike host. Trello, Linear and Jira take
  credentials from the card. Tokens stay in the service process.
- **New task everywhere.** A "New task" toolbar button in both views, for every
  configured source — no longer only the board column "+" and only three sources.
- **Full field editing** in the task detail dialog: due date, labels, assignee
  and milestone, per-source capability-aware (unsupported fields are hidden).
- **Delete** with a confirmation: GitLab, Trello, Linear, Jira and local tasks
  are deleted at the source; GitHub shows a Close-instead note (API limitation).
- Label editing now works for Linear too (team-scoped labels are resolved to
  the ids the API requires).

### Fixed

- Create now offers configured repositories even before their tasks load, and
  cannot submit a project belonging to a different source.
- Saving a task requires a non-empty title for every kind of edit.
- Clearing a GitLab issue's own due date is no longer masked by its milestone
  date; deleting an already-missing Linear issue is idempotent.
- Failed assignee, milestone and label option loads are visible and retry on
  the next dialog open. Delete controls fail closed until capabilities load.
- **GitLab on self-hosted servers.** Issue ids now carry the host, so reads
  and writes go to the right server instead of gitlab.com.
- **"Mine only" on GitHub.** The repository endpoint has no `filter`
  parameter (the old value was silently ignored and showed everything);
  the filter now resolves the login via `GET /user` and passes
  `assignee=<login>`.
- **Jira listing.** `GET /rest/api/3/search` was removed by Atlassian (410);
  listing uses `POST /rest/api/3/search/jql`. Label-column moves apply via
  `update.labels` add/remove instead of silently doing nothing.
- **Trello labels.** `idLabels` takes label ids, not names: writes resolve
  names against the board, and add/remove merges with the card's labels.
- **Linear lookup.** Issue lookup by `APP-123` uses `issueSearch` (there is
  no documented `identifier` filter).
- **Cache races.** A list that started before a write no longer repopulates
  the cache afterwards; attention and rank writes patch cached rows instead
  of refetching every platform.
- **Orphan sessions.** Adoption is going-forward only (pre-existing sessions
  are never adopted) and runs once per session; the watcher is fed by every
  shell refresh.
- **Removed projects.** A session that disappears together with its whole
  project counts as unknown, never as deleted — linked tasks survive.
- Hardening: bearer compare in constant time, 413 on over-limit bodies,
  numeric-only ids in URLs, `http(s)`-only open links, and the file store
  never resets on an unreadable file.

[0.1.0]: https://github.com/NemeZZiZZ/openchamber-tasks-hub/releases/tag/v0.1.0
