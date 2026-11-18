# ARCHITECTURE — openchamber-tasks-hub

Approach **A: the service owns the adapters** (user decision 2026-11-18).
The panel is a dumb renderer; the service holds every credential and does
every platform call.

```
┌──────────── panel (IIFE bundle, sandboxed) ────────────┐
│ page.ts / panel.ts                                     │
│   shell.ts ─ table.ts | board.ts | detail.ts           │
│   shellState.ts (pure grouping/sort/filter/columns)    │
│   linkage.ts (sessionSync/orphan/adopt controller)     │
│   prefs via host.storage (panel scope)                 │
└───────────────┬────────────────────────────────────────┘
                │ host.serviceRequest (host proxy, bearer added by host)
┌───────────────▼────── service (Node, 127.0.0.1) ───────┐
│ main.ts   bearer gate, readStore file, readSettings    │
│           via service host, gh/glab CLI (60s cache),   │
│           workspace git-remotes (60s cache)            │
│ routes.ts /tasks /link /workspace /adapters /options   │
│           /status /accounts /health + DELETE/destroy   │
│ engine.ts fan-out + cache + last-good + write-through  │
│           + error markers + in-flight coalescing       │
│ adapters/ local | github | gitlab | trello | linear    │
│           | jira (+ json.ts shared guard)              │
│ auth.ts   tokenFromStore / resolveToken (ci-hub)       │
│ configStore.ts JSON file store (data dir)              │
└───────────────┬────────────────────────────────────────┘
                │ https (egress)
   api.github.com · <gitlab hosts> · trello · linear · jira
```

## Layers

- **`src/domain/`** — pure, no SDK/DOM imports, unit-tested: `task.ts`
  (UnifiedTask, validate, patch; `ADAPTER_IDS` — единственный источник
  adapter-id), `statusMap.ts` (listId mapping + write-back patch,
  non-mapping labels preserved; passthrough-адаптеры в одном Set),
  `attention.ts` (agent activity → badge action), `remotes.ts`
  (`git remote -v` → repo keys для empty-repos discovery), `unlink.ts`
  (link health: unknown is never deletion), `autoTask.ts` (adopt guard,
  Start Agent plan).
- **`src/store/`** — storage-seam records: `task:<id>` (local tasks),
  `meta:<adapter>:<externalId>` (overlay for EVERY adapter: sessionId,
  rank, badge — engine join has no local/remote branching), `prefs`
  (viewMode, query, adapter, project, collapsed columns, columnOrder),
  `orphanWatermark`. One record per task — edits never clobber.
- **`src/adapters/`** — `TaskAdapter` contract (`list/get/create/update` + capabilities/delete/options),
  `AdapterError{retryable,notFound,credentials}` taxonomy, repo keys
  (`github:owner/repo`, `gitlab:host/path`, `trello:<boardId>`,
  `linear:<team>`, `jira:<host>/<projectKey>`). `create()` returns the
  composite id its own `get()` reads (duplicates guard). `local`
  implements the same contract over the service store; shared JSON guard
  in `json.ts`.
- **`src/service/`** — engine (per-scope cache 20s TTL + persisted
  last-good; error markers `error:<adapter>:<id>` override cached rows so
  a failed write-back stays visible; in-flight coalescing per cache-key;
  one shared local-task index per list), routes (bearer + JSON in/out,
  status-honoring replies), auth (OpenChamber store → card settings → CLI,
  anti-phish: pasted tokens only for public hosts or the configured
  self-hosted server), workspace discovery (panel-reported directories →
  `git remote -v` → repo keys, 60s cache).
- **`src/host/`** — panel-side live wiring: `serviceClient.ts`
  (host.serviceRequest wrapper, throws on non-2xx), `linkage.ts`
  (controller: startSession→link, attention→/link with skip-unchanged,
  session-gone→DELETE local / clear-link remote, orphan adoption —
  unit-tested), `sessionSync.ts` (watch every project; disappearance
  trusted only when ALL snapshots are ready, `mapTasksToWatched`),
  `orphanSessions.ts` (watermark in the panel store; reconcile before
  adopt), `workspace.ts` (one-off lookups, startSession delivery states,
  `reportWorkspace`).
- **`src/ui/`** — shell (toolbar: adapter filter from the registry hiding
  unconfigured platforms, project filter, search; table⇄kanban toggle),
  table (updated desc, inline list select, Retry re-sends the last PATCH),
  board (dynamic listId columns + known-empty extras; card drag with
  fractional local rank; column collapse to a vertical strip and column
  drag-reorder, both persisted), detail dialog (source badge, Open-in
  link, sync line, Start Agent/Open Chat), `styles.ts` — host `--oc-*`
  tokens only.

## Key decisions

1. **Service owns adapters** (A) — tokens never in the browser; central
   cache/rate-limit; B (panel-owned) and C (mirror + outbox) rejected for
   v1 (C can grow onto A later without contract change).
2. **listId over status** — v0.0.0 board columns are the remote lists;
   `status` stays a coarse five-value for counts/sorting
   (`statusForListId`).
3. **Local overlay for remote linkage** — moving/linking a remote card is
   a local fact; remote order stays `updatedAt desc`; drag-reorder is
   local-only.
4. **Badge, not column moves** — agent activity never writes to the remote
   board in v0.0.0.
5. **Last-writer-wins + visible errors** — no outbox; a failed write-back
   is persisted and rendered (`syncState: error`, Retry in table view).
6. **Greenfield, no kanban migration** — no `task:<id>` import from the
   kanban extension.

## Extension points

- New platform = one file implementing `TaskAdapter` + `registerAdapter`
  in `src/adapters/index.ts` + settings fields in the manifest. UI, engine
  and protocol stay untouched.
- Outbox/mirror (approach C) can wrap the same adapter contract later.

## Build

esbuild: browser IIFE (`panel/main.js`, `panel/page.js`), Node ESM
(`service/main.js`). `npm run check` gates typecheck + tests + build; the
host never builds.
