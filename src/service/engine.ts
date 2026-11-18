// Service engine (ci-hub shape): fans out to adapters, joins overlays,
// caches per scope with last-good on failure, write-through with visible
// errors. All storage here is the service data-dir store (local tasks,
// meta: overlays, cache:/error: bookkeeping) — never tokens.
import { validateTask, type UnifiedTask, type TaskPatch } from '../domain/task.ts';
import { registeredAdapters, getAdapter } from '../adapters/index.ts';
import {
  AdapterError, parseRepoKey, type AdapterCapabilities, type AdapterOptions, type Ctx, type FetchLike, type RemoteTask, type Scope, type SettingsReader, type StorageClient,
} from '../adapters/types.ts';
import { deleteOverlay, getOverlay, setOverlay } from '../store/overlayStore.ts';
import { loadLocalTasks, deleteLocalTask } from '../store/taskStore.ts';
import { knownInstances, serverOf, resolveToken } from './auth.ts';

const CACHE_TTL_MS = 20_000;
const CACHE_PREFIX = 'cache:';
const ERROR_PREFIX = 'error:';
const OPTIONS_TTL_MS = 60_000;
const OPTIONS_PREFIX = 'options:';

export type AdapterHealth = {
  id: string;
  label: string;
  ok: boolean;
  message: string | null;
  /** 'credentials' = permanent "nothing configured": UI toasts once, no banner. */
  kind?: 'credentials';
};

export type EngineDeps = {
  adapters?: TaskAdapter[];
  storage: StorageClient;
  settings: SettingsReader;
  fetch: FetchLike;
  auth: Ctx['auth'];
  now(): number;
  newId(): string;
  /** Workspace git-remote repo keys for empty-`repos` discovery (review #4). */
  workspaceRemotes?: () => Promise<string[]>;
};

import type { TaskAdapter } from '../adapters/types.ts';

// Scope v1: repos from the card settings ("github:owner/name, …"), no
// auto-enumeration; assignee filter comes from the board UI prefs.
const parseRepos = (raw: string | null): string[] =>
  typeof raw === 'string'
    ? raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

const scopeKey = (scope: Scope): string =>
  `${[...scope.repos].sort().join('|')};${scope.assignee ?? ''}`;

const rowId = (adapterId: string, externalId: string): string => `tas_${adapterId}_${externalId}`;

export type ListParams = { adapter?: string; project?: string; q?: string; assignee?: string };

export type ListResult = {
  tasks: UnifiedTask[];
  health: AdapterHealth[];
  cached: boolean;
  /** Set when nothing is discoverable: visible hint instead of silence (review UX #3). */
  notice?: string | null;
  /** How the scope was built: workspace discovery, and whether the
   * assigned-to-me filter was applied. The panel surfaces both so a
   * bot-token install never looks silently empty. */
  scope: { discovery: boolean; mineOnly: boolean };
};

export type PatchResult = { task?: UnifiedTask; error?: string; retryable?: boolean };

export type CreateInput = {
  adapterId: string;
  projectRef: string | null;
  title: string;
  description: string;
  labels?: string[];
  listId?: string;
};

export const createEngine = (deps: EngineDeps) => {
  const adapters = deps.adapters ?? registeredAdapters();
  const mem = new Map<string, { rows: UnifiedTask[]; at: number }>();
  const inFlight = new Map<string, Promise<{ rows: UnifiedTask[]; health: AdapterHealth; fromCache: boolean }>>();
  const lastListError = new Map<string, { message: string; credentials?: boolean }>();
  // Options cache: memory-only 60 s entries keyed options:<adapter>:<project>,
  // plus the in-flight promises so concurrent dialog opens share one fetch.
  const optionsMem = new Map<string, { at: number; value: AdapterOptions }>();
  const optionsInFlight = new Map<string, Promise<AdapterOptions>>();
  // Cache generation: a list that started before a write finished must not
  // repopulate the caches afterwards (pre-publish review).

  const ctxFor = (adapter: TaskAdapter): Ctx => ({
    storage: deps.storage,
    settings: deps.settings,
    fetch: deps.fetch,
    now: deps.now,
    newId: deps.newId,
    auth: deps.auth,
  });

  const cacheKey = (adapterId: string, scope: Scope): string => `${CACHE_PREFIX}${adapterId}:${scopeKey(scope)}`;
  let generation = 0;

  const invalidate = async (): Promise<void> => {
    // A newer generation: stale in-flight joins skip their cache writes,
    // and waiters re-list instead of sharing the old fan-out.
    generation++;
    mem.clear();
    inFlight.clear();
    for (const key of await deps.storage.keys()) {
      if (key.startsWith(CACHE_PREFIX)) await deps.storage.delete(key);
    }
  };

  const readError = async (adapterId: string, id: string): Promise<{ message: string; at: number } | null> => {
    const raw = await deps.storage.get(`${ERROR_PREFIX}${adapterId}:${id}`);
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.message !== 'string' || typeof r.at !== 'number') return null;
    return { message: r.message, at: r.at };
  };

  // Single-row local lookup for patch/create joins (the list path uses the
  // shared index built once per list — review #10).
  const singleLocalIndex = async (adapterId: string, externalId: string): Promise<Map<string, UnifiedTask>> => {
    if (adapterId !== 'local') return new Map();
    const { tasks } = await loadLocalTasks(deps.storage);
    const found = tasks.find((t) => t.externalId === externalId);
    return found ? new Map([[found.externalId, found]]) : new Map();
  };

  // Join: adapter output + overlay + error marker. Every adapter — local
  // included — takes the same overlay path (ARCHITECTURE: no local/remote
  // special-casing in the join, review #8); linkage/rank/badge live in the
  // service store, never in the remote system.
  const joinRow = async (
    adapterId: string,
    remote: RemoteTask,
    _localIndex: Map<string, UnifiedTask>,
  ): Promise<UnifiedTask> => {
    const overlay = await getOverlay(deps.storage, adapterId, remote.externalId);
    const err = await readError(adapterId, remote.externalId);
    return {
      id: rowId(adapterId, remote.externalId),
      adapterId: adapterId as UnifiedTask['adapterId'],
      externalId: remote.externalId,
      url: remote.url,
      title: remote.title,
      description: remote.description,
      status: remote.status,
      listId: remote.listId,
      rank: overlay?.rank ?? 0,
      projectRef: remote.projectRef,
      assignee: remote.assignee,
      labels: remote.labels,
      updatedAt: remote.updatedAt,
      syncState: err ? 'error' : 'synced',
      syncError: err?.message ?? null,
      sessionId: overlay?.sessionId ?? null,
      needsAttentionSince: overlay?.needsAttentionSince ?? null,
      author: remote.author ?? null,
      closed: remote.closed ?? remote.listId === 'done',
      milestone: remote.milestone ?? null,
      dueDate: remote.dueDate ?? null,
      comments: remote.comments ?? 0,
      checklist: remote.checklist ?? null,
    };
  };

  const listOne = (
    adapter: TaskAdapter,
    scope: Scope,
    localIndex: Map<string, UnifiedTask>,
  ): Promise<{ rows: UnifiedTask[]; health: AdapterHealth; fromCache: boolean }> => {
    const key = cacheKey(adapter.id, scope);
    // In-flight coalescing (review #10): concurrent lists for the same
    // scope share one fan-out instead of duplicating platform requests.
    const running = inFlight.get(key);
    if (running) return running;
    const startedGeneration = generation;
    const promise = (async (): Promise<{ rows: UnifiedTask[]; health: AdapterHealth; fromCache: boolean }> => {
      const hit = mem.get(key);
      if (hit && deps.now() - hit.at < CACHE_TTL_MS) {
        // Cached rows were joined before any newer PATCH failure: re-read the
        // error markers so a failed write-back still shows on the board
        // (review #3 — never serve a stale 'synced' over a live error).
        const rows = await Promise.all(hit.rows.map(async (row) => {
          const err = await readError(row.adapterId, row.externalId);
          return err ? { ...row, syncState: 'error' as const, syncError: err.message } : row;
        }));
        return { rows, health: { id: adapter.id, label: adapter.label, ok: true, message: null }, fromCache: true };
      }
      try {
        const remote = await adapter.list(ctxFor(adapter), scope);
        const rows = await Promise.all(remote.map((r) => joinRow(adapter.id, r, localIndex)));
        if (startedGeneration === generation) {
          mem.set(key, { rows, at: deps.now() });
          await deps.storage.set(key, { rows, at: deps.now() });
        }
        lastListError.delete(adapter.id);
        return { rows, health: { id: adapter.id, label: adapter.label, ok: true, message: null }, fromCache: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const credentials = err instanceof AdapterError && err.credentials;
        lastListError.set(adapter.id, { message, credentials });
        // Last-good: a previous successful list for this scope still renders.
        const last = await deps.storage.get(key);
        if (typeof last === 'object' && last !== null && Array.isArray((last as { rows?: unknown }).rows)) {
          const rows = ((last as { rows: unknown[] }).rows)
            .map((r) => validateTask(r))
            .filter((r): r is UnifiedTask => r !== null);
          return { rows, health: { id: adapter.id, label: adapter.label, ok: false, message, kind: credentials ? 'credentials' : undefined }, fromCache: true };
        }
        return { rows: [], health: { id: adapter.id, label: adapter.label, ok: false, message, kind: credentials ? 'credentials' : undefined }, fromCache: true };
      }
    })();
    inFlight.set(key, promise);
    void promise.catch(() => undefined).finally(() => { inFlight.delete(key); });
    return promise;
  };

  return {
    // GET /tasks — fan out, join, filter. cached=true when every source came
    // from a cache (memory TTL or persisted last-good).
    async list(params: ListParams): Promise<ListResult> {
      const fromSettings = parseRepos(await deps.settings('repos'));
      const discovery = fromSettings.length === 0;
      let repos = fromSettings;
      let assignee = params.assignee === 'me' ? 'me' : null;
      // Design: empty `repos` = workspace git remotes. Assigned-to-me stays
      // the default (never an auto-enumeration of everything the token can
      // see), but the panel can pass assignee=all to show everything — a
      // bot token otherwise renders a silently empty board.
      if (discovery) {
        repos = (await deps.workspaceRemotes?.()) ?? [];
        if (params.assignee === undefined) assignee = 'me';
      }
      const scope: Scope = { repos, assignee };
      const wanted = params.adapter ? adapters.filter((a) => a.id === params.adapter) : adapters;
      // Local index built once per list (review #10): the per-row
      // findLocal loop was O(N²) storage reads.
      const localIndex = new Map(
        (await loadLocalTasks(deps.storage)).tasks.map((t) => [t.externalId, t]),
      );
      const results = await Promise.all(wanted.map((a) => listOne(a, scope, localIndex)));
      let tasks = results.flatMap((r) => r.rows);
      const health = results.map((r) => r.health);
      if (params.project) tasks = tasks.filter((t) => t.projectRef === params.project);
      if (params.q) {
        const q = params.q.toLowerCase();
        tasks = tasks.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
      }
      const cached = results.length > 0 && results.every((r) => r.fromCache);
      const notice = repos.length === 0
        ? 'No repositories yet — set repos on the Tasks card or open a workspace project.'
        : null;
      return { tasks, health, cached, notice, scope: { discovery, mineOnly: assignee === 'me' } };
    },

    // PATCH /tasks/:adapter/:id — write-through. Failure returns
    // {error, retryable} and persists an error marker so the next list
    // shows syncState: 'error' on that row — never silent divergence.
    async patch(adapterId: string, id: string, patch: TaskPatch): Promise<PatchResult> {
      // The injected adapter set wins over the auto-registry (test seams).
      const adapter = adapters.find((a) => a.id === adapterId) ?? getAdapter(adapterId);
      if (!adapter) return { error: `unknown adapter: ${adapterId}`, retryable: false };
      const ctx = ctxFor(adapter);
      try {
        if (!patch.fromListId && patch.listId) {
          // Fill the move source from the remote so label bookkeeping is exact.
          const current = await adapter.get(ctx, id);
          patch = { ...patch, fromListId: current?.listId ?? 'open' };
        }
        await adapter.update(ctx, id, patch);
        await deps.storage.delete(`${ERROR_PREFIX}${adapterId}:${id}`);
        await invalidate();
        const fresh = await adapter.get(ctx, id);
        if (!fresh) return { task: undefined };
        const localIndex = await singleLocalIndex(adapterId, fresh.externalId);
        return { task: await joinRow(adapterId, fresh, localIndex) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryable = err instanceof AdapterError ? err.retryable : true;
        await deps.storage.set(`${ERROR_PREFIX}${adapterId}:${id}`, { message, retryable, at: deps.now() });
        return { error: message, retryable };
      }
    },

    // POST /tasks — create through the adapter, return the joined row.
    async create(input: CreateInput): Promise<PatchResult> {
      const adapter = adapters.find((a) => a.id === input.adapterId) ?? getAdapter(input.adapterId);
      if (!adapter) return { error: `unknown adapter: ${input.adapterId}`, retryable: false };
      const ctx = ctxFor(adapter);
      try {
        const externalId = await adapter.create(ctx, {
          projectRef: input.projectRef,
          title: input.title,
          description: input.description,
          labels: input.labels,
          listId: input.listId,
        });
        await invalidate();
        const fresh = await adapter.get(ctx, externalId);
        if (!fresh) return { task: undefined };
        const localIndex = await singleLocalIndex(adapter.id, fresh.externalId);
        return { task: await joinRow(adapter.id, fresh, localIndex) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryable = err instanceof AdapterError ? err.retryable : true;
        return { error: message, retryable };
      }
    },

    // GET /options — edit-dialog listings (people/milestones/labels) with
    // native ids. Memory-only 60 s cache + in-flight coalescing: an
    // unreachable source fails the edit dialog, never the board, so no
    // persisted last-good here.
    async options(adapterId: string, projectRef: string): Promise<AdapterOptions> {
      const adapter = adapters.find((a) => a.id === adapterId) ?? getAdapter(adapterId);
      if (!adapter) throw new AdapterError(`unknown adapter: ${adapterId}`, false);
      const key = `${OPTIONS_PREFIX}${adapter.id}:${projectRef}`;
      const hit = optionsMem.get(key);
      if (hit && deps.now() - hit.at < OPTIONS_TTL_MS) return hit.value;
      const running = optionsInFlight.get(key);
      if (running) return running;
      const promise = (async (): Promise<AdapterOptions> => {
        const value = await adapter.options(ctxFor(adapter), projectRef);
        optionsMem.set(key, { at: deps.now(), value });
        return value;
      })();
      optionsInFlight.set(key, promise);
      void promise.catch(() => undefined).finally(() => { optionsInFlight.delete(key); });
      return promise;
    },

    // POST /tasks/:adapter/:id/destroy — true delete on the source (design
    // 2026-11-21), distinct from deleteTask (board/link cleanup only).
    // notFound is idempotent success; the overlay and error marker are
    // always cleaned, caches invalidated.
    async destroy(adapterId: string, id: string): Promise<{ destroyed: true }> {
      const adapter = adapters.find((a) => a.id === adapterId) ?? getAdapter(adapterId);
      // notFound=true so the route maps an unknown adapter to 404.
      if (!adapter) throw new AdapterError(`unknown adapter: ${adapterId}`, false, true);
      try {
        await adapter.delete(ctxFor(adapter), id);
      } catch (err) {
        if (!(err instanceof AdapterError && err.notFound)) throw err;
      }
      await deleteOverlay(deps.storage, adapterId, id);
      await deps.storage.delete(`${ERROR_PREFIX}${adapterId}:${id}`);
      await invalidate();
      return { destroyed: true };
    },

    // GET /adapters — the registry as data, so UI filters never hardcode
    // adapter ids (review #7) and can hide unconfigured platforms
    // (review UX round 2): configured = a token is resolvable for the
    // adapter's primary host, checked locally (no platform request).
    // Entries carry the adapter's static capabilities so the UI gates every
    // write affordance on data, never on hardcoded platform support.
    async adapters(): Promise<{ adapters: { id: string; label: string; configured: boolean; capabilities: AdapterCapabilities; projects: string[] }[] }> {
      // configured = a token is resolvable for the settings server, the
      // public host, OR any host the store or the workspace remotes know
      // (a self-hosted GitLab connected in OpenChamber must not look
      // unconfigured just because gitlab.com has no token).
      const settings = await deps.auth.readSettings().catch(() => ({} as Record<string, string>));
      const raw = await deps.auth.readStore().catch(() => undefined);
      const remotes = (await deps.workspaceRemotes?.()) ?? [];
      const configuredRepos = parseRepos(await deps.settings('repos').catch(() => null));
      const knownRepos = configuredRepos.length > 0 ? configuredRepos : remotes;
      const out = await Promise.all(adapters.map(async (a) => {
        const projects = knownRepos.filter((key) => key.startsWith(`${a.id}:`));
        if (a.id === 'local') return { id: a.id, label: a.label, configured: true, capabilities: a.capabilities, projects };
        const hosts = new Set<string>(a.publicHosts);
        const server = serverOf(settings, a)?.host;
        if (server) hosts.add(server);
        for (const entry of knownInstances(raw, [a])) hosts.add(entry.host);
        for (const key of remotes) {
          if (typeof key !== 'string' || !key.startsWith(`${a.id}:`)) continue;
          const ref = parseRepoKey(key, a.publicHosts[0] ?? '');
          if (ref?.host) hosts.add(ref.host);
        }
        let configured = false;
        for (const host of hosts) {
          if (!host) continue;
          const resolved = await resolveToken(deps.auth, a, host);
          if (resolved.source !== null) { configured = true; break; }
        }
        return { id: a.id, label: a.label, configured, capabilities: a.capabilities, projects };
      }));
      return { adapters: out };
    },

    // GET /status — per-adapter health rows for the page banner.
    async status(): Promise<{ adapters: AdapterHealth[] }> {
      const health: AdapterHealth[] = adapters.map((a) => {
        const last = lastListError.get(a.id);
        return {
          id: a.id,
          label: a.label,
          ok: last === undefined,
          message: last?.message ?? null,
          kind: last?.credentials ? 'credentials' : undefined,
        };
      });
      return { adapters: health };
    },

    // GET /accounts — hosts connected in OpenChamber, per provider.
    async accounts(): Promise<{ accounts: { provider: string; host: string }[] }> {
      const raw = await deps.auth.readStore().catch(() => undefined);
      const providers = adapters.filter((a) => a.storeKey !== null);
      return { accounts: knownInstances(raw, providers) };
    },

    // Overlay write-through for the panel's session sync (Task 8): the
    // service store is the only place overlays live, so the panel asks.
    // Attention and rank change constantly — they patch the cached rows in
    // place instead of invalidating (pre-publish review): every /link used
    // to refetch every platform and delete the last-good fallback.
    async setLink(adapterId: string, externalId: string, patch: { sessionId?: string | null; needsAttentionSince?: number | null; rank?: number | null }): Promise<void> {
      await setOverlay(deps.storage, adapterId, externalId, patch);
      const apply = (rows: UnifiedTask[]): UnifiedTask[] => rows.map((row) => {
        if (row.adapterId !== adapterId || row.externalId !== externalId) return row;
        const next = { ...row };
        if ('sessionId' in patch) next.sessionId = patch.sessionId ?? null;
        if ('needsAttentionSince' in patch) next.needsAttentionSince = patch.needsAttentionSince ?? null;
        if ('rank' in patch) next.rank = patch.rank ?? 0;
        return next;
      });
      for (const entry of mem.values()) entry.rows = apply(entry.rows);
      for (const key of await deps.storage.keys()) {
        if (!key.startsWith(CACHE_PREFIX)) continue;
        const raw = await deps.storage.get(key);
        if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { rows?: unknown }).rows)) continue;
        const cached = raw as { rows: UnifiedTask[]; at: number };
        await deps.storage.set(key, { rows: apply(cached.rows), at: cached.at });
      }
    },

    // POST /workspace { directories } — the panel reports the workspace
    // project roots it knows; the service resolves their git remotes for
    // empty-`repos` discovery (review #4).
    async workspaceSync(directories: unknown): Promise<{ ok: true; count: number }> {
      if (!Array.isArray(directories)) throw new Error('directories must be an array');
      const clean = directories
        .filter((d): d is string => typeof d === 'string' && d.startsWith('/') && d.length > 1)
        .slice(0, 32);
      await deps.storage.set('workspace:directories', clean);
      return { ok: true, count: clean.length };
    },

    // Unlink endpoint semantics (review #1): deleting a linked session
    // removes a LOCAL task record outright; for a remote task it only
    // clears the local link — the remote issue is never touched.
    async deleteTask(adapterId: string, id: string): Promise<{ deleted: 'task' | 'link' }> {
      if (adapterId === 'local') {
        await deleteLocalTask(deps.storage, `t_${id}`);
        await deps.storage.delete(`${ERROR_PREFIX}local:${id}`);
        return { deleted: 'task' };
      }
      await setOverlay(deps.storage, adapterId, id, { sessionId: null, needsAttentionSince: null });
      await invalidate();
      return { deleted: 'link' };
    },
  };
};
