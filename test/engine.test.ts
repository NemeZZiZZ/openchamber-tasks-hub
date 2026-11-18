// test/engine.test.ts — engine + routes + file store, fixture fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine, type EngineDeps } from '../src/service/engine.ts';
import { handleRequest } from '../src/service/routes.ts';
import { createFileStorage } from '../src/service/configStore.ts';
import { localAdapter } from '../src/adapters/local.ts';
import { gitlabAdapter } from '../src/adapters/gitlab.ts';
import type { AdapterId } from '../src/domain/task.ts';
import {
  AdapterError, type AdapterCapabilities, type AdapterOptions, type Ctx, type FetchLike, type NewTask, type RemoteTask, type Scope, type TaskAdapter,
} from '../src/adapters/types.ts';
import { getOverlay, setOverlay } from '../src/store/overlayStore.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

// Stub remote adapter: canned rows, scripted failures, call counter.
let failList = false;
let failPatch = false;
let listCalls = 0;
const stubRemote: TaskAdapter = {
  id: 'github',
  label: 'GitHub',
  storeKey: 'github',
  publicHosts: ['github.com'],
  settingKey: 'github-token',
  async list(_ctx: Ctx, _scope: Scope): Promise<RemoteTask[]> {
    listCalls += 1;
    if (failList) throw new Error('boom');
    return [{
      externalId: 'owner/repo#1', url: 'u', title: 'Remote one', description: '',
      listId: 'open', status: 'todo', projectRef: 'github:owner/repo',
      assignee: 'me', labels: ['bug'], updatedAt: 5,
    }];
  },
  async get(_ctx: Ctx, id: string): Promise<RemoteTask | null> {
    if (id !== 'owner/repo#1') return null;
    return {
      externalId: 'owner/repo#1', url: 'u', title: failPatch ? 'Remote one' : 'Remote patched', description: '',
      listId: 'open', status: 'todo', projectRef: 'github:owner/repo', assignee: null, labels: [], updatedAt: 6,
    };
  },
  async create(_ctx: Ctx, _input: NewTask): Promise<string> {
    throw new Error('not supported');
  },
  async update(_ctx: Ctx, _id: string, _patch): Promise<void> {
    if (failPatch) throw new Error('write failed');
  },
  capabilities: { create: false, delete: false, fields: { assignee: false, milestone: false, dueDate: false, labels: false } },
  async delete(_ctx: Ctx, _id: string): Promise<void> { throw new Error('delete not used in this suite'); },
  async options(_ctx: Ctx, _projectRef: string): Promise<AdapterOptions> { return { people: [], milestones: [], labels: [] }; },
};

let clock = 1000;
const makeDeps = (): EngineDeps => ({
  adapters: [localAdapter, stubRemote],
  storage: createFileStorage(mkdtempSync(join(tmpdir(), 'tasks-test-'))),
  settings: async () => 'github:owner/repo',
  fetch: (async () => { throw new Error('no fetch in engine test'); }) as unknown as FetchLike,
  auth: { readStore: async () => undefined, readSettings: async () => ({}), cliToken: async () => null },
  now: () => clock,
  newId: () => 'id-1',
});

const BEARER = 'Bearer secret';
const req = (engine: ReturnType<typeof createEngine>, method: string, url: string, body = '') =>
  handleRequest({ method, url, body, bearer: BEARER }, engine, 'secret');

test('unauthorized without bearer → 401', async () => {
  const engine = createEngine(makeDeps());
  const res = await handleRequest({ method: 'GET', url: '/tasks', body: '', bearer: 'Bearer wrong' }, engine, 'secret');
  eq(res.status, 401);
  const noAuth = await handleRequest({ method: 'GET', url: '/tasks', body: '', bearer: null }, engine, 'secret');
  eq(noAuth.status, 401);
});

test('fan-out joins adapters + overlay (plan: sessionId/rank via meta overlay)', async () => {
  const deps = makeDeps();
  await setOverlay(deps.storage, 'github', 'owner/repo#1', { sessionId: 's1', rank: 0.5, needsAttentionSince: 77 });
  const engine = createEngine(deps);
  const res = await req(engine, 'GET', '/tasks');
  eq(res.status, 200);
  const body = res.body as { tasks: { id: string; sessionId: string | null; rank: number; needsAttentionSince: number | null }[] };
  const remote = body.tasks.find((t) => t.id === 'tas_github_owner/repo#1');
  ok(remote);
  eq(remote?.sessionId, 's1');
  eq(remote?.rank, 0.5);
  eq(remote?.needsAttentionSince, 77);
});

test('POST creates a local task; q/adapter filters narrow the list', async () => {
  const deps = makeDeps();
  const engine = createEngine(deps);
  const created = await req(engine, 'POST', '/tasks', JSON.stringify({ adapterId: 'local', title: 'Zebra query hit', description: 'd' }));
  eq(created.status, 201);
  const all = await req(engine, 'GET', '/tasks');
  const rows = (all.body as { tasks: { id: string; title: string }[] }).tasks;
  ok(rows.some((t) => t.title === 'Zebra query hit' && t.id.startsWith('tas_local_')));
  const q = await req(engine, 'GET', '/tasks?q=zebra');
  eq((q.body as { tasks: unknown[] }).tasks.length, 1);
  const byAdapter = await req(engine, 'GET', '/tasks?adapter=github');
  ok((byAdapter.body as { tasks: { id: string }[] }).tasks.every((t) => t.id.startsWith('tas_github_')));
});

test('cache hit within TTL; last-good survives adapter failure', async () => {
  listCalls = 0;
  const engine = createEngine(makeDeps());
  const first = await req(engine, 'GET', '/tasks?adapter=github');
  eq((first.body as { cached: boolean }).cached, false);
  const second = await req(engine, 'GET', '/tasks?adapter=github');
  eq((second.body as { cached: boolean }).cached, true);
  eq(listCalls, 1);
  // TTL expires, adapter goes down: last-good rows still render, health
  // reports the error.
  failList = true;
  clock = 200_000;
  const third = await req(engine, 'GET', '/tasks?adapter=github');
  const body = third.body as { tasks: unknown[]; cached: boolean; health: { ok: boolean; message: string | null }[] };
  eq(body.tasks.length, 1);
  eq(body.cached, true);
  eq(body.health[0]?.ok, false);
  ok(body.health[0]?.message?.includes('boom'));
});
failList = false;

test('patch failure marks syncState error, never lies (plan excerpt)', async () => {
  failList = false; // reset the leak from the last-good test
  failPatch = true;
  const engine = createEngine(makeDeps());
  const bad = await req(engine, 'PATCH', `/tasks/github/${encodeURIComponent('owner/repo#1')}`, JSON.stringify({ title: 'x' }));
  eq(bad.status, 502);
  const badBody = bad.body as { error: string; retryable: boolean };
  ok(badBody.error);
  eq(badBody.retryable, true);
  // The next list surfaces the persisted error on that row.
  const listed = await req(engine, 'GET', '/tasks?adapter=github');
  const row = (listed.body as { tasks: { syncState: string; syncError: string | null }[] }).tasks[0];
  eq(row?.syncState, 'error');
  ok(row?.syncError);
  // Successful write clears the error state.
  failPatch = false;
  const good = await req(engine, 'PATCH', `/tasks/github/${encodeURIComponent('owner/repo#1')}`, JSON.stringify({ title: 'ok' }));
  eq(good.status, 200);
  const listed2 = await req(engine, 'GET', '/tasks?adapter=github');
  const row2 = (listed2.body as { tasks: { syncState: string }[] }).tasks[0];
  eq(row2?.syncState, 'synced');
});

test('engine PATCH fills fromListId via adapter.get when UI omits it', async () => {
  const seen: string[] = [];
  const tracking: TaskAdapter = {
    ...stubRemote,
    async get(_ctx: Ctx, _id: string): Promise<RemoteTask | null> {
      seen.push('get');
      return {
        externalId: 'owner/repo#1', url: 'u', title: 'T', description: '',
        listId: 'review', status: 'review', projectRef: null, assignee: null, labels: [], updatedAt: 1,
      };
    },
    async update(_ctx: Ctx, _id: string, patch): Promise<void> {
      seen.push(`update:${String(patch.fromListId)}`);
    },
  };
  const engine = createEngine({ ...makeDeps(), adapters: [tracking] });
  await engine.patch('github', 'owner/repo#1', { listId: 'done' });
  ok(seen.includes('get'));
  ok(seen.includes('update:review'));
});

test('local tasks load once per list, not per row (review #10)', async () => {
  let keysReads = 0;
  const deps = makeDeps();
  const countingStorage: typeof deps.storage = {
    ...deps.storage,
    keys: async () => { keysReads += 1; return deps.storage.keys(); },
  };
  const engine = createEngine({ ...deps, storage: countingStorage });
  for (const title of ['L1', 'L2', 'L3']) {
    await req(engine, 'POST', '/tasks', JSON.stringify({ adapterId: 'local', title, description: '' }));
  }
  keysReads = 0;
  await req(engine, 'GET', '/tasks');
  // Constant, not O(N): 1 = the engine's shared local index (the per-row
  // findLocal loop was O(N²)), 1 = the local adapter's own list read.
  eq(keysReads, 2);
});

test('empty repos AND empty workspace discovery → visible notice, not silence (review UX #3)', async () => {
  const deps = makeDeps();
  const engine = createEngine({ ...deps, settings: async () => '', workspaceRemotes: async () => [] });
  const res = await req(engine, 'GET', '/tasks');
  const notice = (res.body as { notice?: string | null }).notice;
  ok(notice?.includes('No repositories'));
});

test('concurrent lists coalesce into one adapter fan-out (review #10)', async () => {
  listCalls = 0;
  const engine = createEngine(makeDeps());
  await Promise.all([req(engine, 'GET', '/tasks?adapter=github'), req(engine, 'GET', '/tasks?adapter=github')]);
  eq(listCalls, 1);
});

test('GET /adapters drives the UI filter from the registry (review #7)', async () => {
  // No injected adapters: the engine falls back to the auto-registry, which
  // has all six platforms registered via src/adapters/index.ts.
  const deps = makeDeps();
  delete (deps as { adapters?: unknown }).adapters;
  const engine = createEngine(deps);
  const res = await req(engine, 'GET', '/adapters');
  eq(res.status, 200);
  const ids = (res.body as { adapters: { id: string; label: string }[] }).adapters.map((a) => a.id);
  for (const id of ['local', 'github', 'gitlab', 'trello', 'linear', 'jira']) ok(ids.includes(id), `missing ${id}`);
  ok((res.body as { adapters: { label: string }[] }).adapters.every((a) => typeof a.label === 'string'));
});

test('/adapters exposes configured projects even before any tasks load', async () => {
  const engine = createEngine(makeDeps());
  const res = await req(engine, 'GET', '/adapters');
  const rows = (res.body as { adapters: { id: string; projects: string[] }[] }).adapters;
  deep(rows.find((a) => a.id === 'github')?.projects, ['github:owner/repo']);
  deep(rows.find((a) => a.id === 'local')?.projects, []);
});

test('/adapters flags unconfigured platforms so the UI can hide them (review UX round 2)', async () => {
  const deps = makeDeps();
  delete (deps as { adapters?: unknown }).adapters;
  const engine = createEngine({
    ...deps,
    // No tokens anywhere: local is always configured, the rest are not.
    settings: async () => '',
  });
  const res = await req(engine, 'GET', '/adapters');
  const byId = new Map((res.body as { adapters: { id: string; configured: boolean }[] }).adapters.map((a) => [a.id, a.configured]));
  eq(byId.get('local'), true);
  eq(byId.get('github'), false);
  eq(byId.get('trello'), false);
  eq(byId.get('linear'), false);
  eq(byId.get('jira'), false);
  // With a pasted github-token, github becomes configured (the auth layer
  // reads the full settings record — the same source service/main wires).
  const engine2 = createEngine({
    ...deps,
    settings: async (key) => (key === 'github-token' ? 'T' : ''),
    auth: { readStore: async () => undefined, readSettings: async () => ({ 'github-token': 'T' }), cliToken: async () => null },
  });
  const res2 = await req(engine2, 'GET', '/adapters');
  const byId2 = new Map((res2.body as { adapters: { id: string; configured: boolean }[] }).adapters.map((a) => [a.id, a.configured]));
  eq(byId2.get('github'), true);
  eq(byId2.get('gitlab'), false);
});

test('POST /link persists an overlay and the join exposes it (review #1)', async () => {
  const deps = makeDeps();
  const engine = createEngine(deps);
  const res = await req(engine, 'POST', '/link', JSON.stringify({
    adapterId: 'github', externalId: 'owner/repo#1', patch: { sessionId: 'ses_1', rank: 0.5 },
  }));
  eq(res.status, 200);
  const listed = await req(engine, 'GET', '/tasks?adapter=github');
  const row = (listed.body as { tasks: { sessionId: string | null; rank: number }[] }).tasks[0];
  eq(row?.sessionId, 'ses_1');
  eq(row?.rank, 0.5);
  // 401 without the bearer.
  const denied = await handleRequest({ method: 'POST', url: '/link', body: '{}', bearer: 'Bearer wrong' }, engine, 'secret');
  eq(denied.status, 401);
  // Malformed body → 400.
  const bad = await req(engine, 'POST', '/link', JSON.stringify({ adapterId: 'github' }));
  eq(bad.status, 400);
});

test('DELETE /tasks/local/:id removes the local record (review #1)', async () => {
  const engine = createEngine(makeDeps());
  const created = await req(engine, 'POST', '/tasks', JSON.stringify({ adapterId: 'local', title: 'Doomed', description: '' }));
  const id = (created.body as { task?: { externalId: string } }).task?.externalId;
  ok(id);
  const res = await req(engine, 'DELETE', `/tasks/local/${encodeURIComponent(id as string)}`);
  eq(res.status, 200);
  const listed = await req(engine, 'GET', '/tasks?adapter=local');
  eq((listed.body as { tasks: unknown[] }).tasks.length, 0);
});

test('DELETE /tasks/:adapter/:id on a remote clears the link, never the remote row (review #1)', async () => {
  const deps = makeDeps();
  const engine = createEngine(deps);
  await setOverlay(deps.storage, 'github', 'owner/repo#1', { sessionId: 'ses_1' });
  const res = await req(engine, 'DELETE', `/tasks/github/${encodeURIComponent('owner/repo#1')}`);
  eq(res.status, 200);
  const listed = await req(engine, 'GET', '/tasks?adapter=github');
  const row = (listed.body as { tasks: { sessionId: string | null }[] }).tasks[0];
  eq(row?.sessionId, null);
  eq((listed.body as { tasks: unknown[] }).tasks.length, 1);
});

test('empty repos falls back to workspace remotes + assigned-to-me (review #4)', async () => {
  const requested: Scope[] = [];
  const probing: TaskAdapter = {
    ...stubRemote,
    async list(_ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
      requested.push(scope);
      return [];
    },
  };
  const deps = makeDeps();
  const engine = createEngine({
    ...deps,
    adapters: [probing],
    settings: async () => '', // no repos configured on the card
    workspaceRemotes: async () => ['github:owner/app', 'gitlab:acme.atlassian.net/proj'],
  });
  await engine.list({});
  deep(requested[0]?.repos, ['github:owner/app', 'gitlab:acme.atlassian.net/proj']);
  eq(requested[0]?.assignee, 'me');
  // Non-empty repos setting wins; no assignee injection.
  const engine2 = createEngine({ ...deps, adapters: [probing], settings: async () => 'github:owner/repo' });
  await engine2.list({});
  deep(requested[1]?.repos, ['github:owner/repo']);
  eq(requested[1]?.assignee, null);
});

test('discovery reports its scope; assignee=all opts out of mine-only', async () => {
  const requested: Scope[] = [];
  const probing: TaskAdapter = {
    ...stubRemote,
    async list(_ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
      requested.push(scope);
      return [];
    },
  };
  const deps = makeDeps();
  const engine = createEngine({
    ...deps,
    adapters: [probing],
    settings: async () => '',
    workspaceRemotes: async () => ['github:owner/app'],
  });
  const dflt = await engine.list({});
  deep(dflt.scope, { discovery: true, mineOnly: true });
  const all = await engine.list({ assignee: 'all' });
  eq(requested[1]?.assignee, null);
  deep(all.scope, { discovery: true, mineOnly: false });
  const engine2 = createEngine({ ...deps, adapters: [probing], settings: async () => 'github:owner/repo' });
  const card = await engine2.list({});
  deep(card.scope, { discovery: false, mineOnly: false });
});

test('/link rank works for local tasks too — the join reads the overlay for every adapter (review #5)', async () => {
  const deps = makeDeps();
  const engine = createEngine(deps);
  await req(engine, 'POST', '/tasks', JSON.stringify({ adapterId: 'local', title: 'Ranked', description: '' }));
  const res = await req(engine, 'POST', '/link', JSON.stringify({
    adapterId: 'local', externalId: 'id-1', patch: { rank: 0.25 },
  }));
  eq(res.status, 200);
  const listed = await req(engine, 'GET', '/tasks?adapter=local');
  const row = (listed.body as { tasks: { rank: number }[] }).tasks[0];
  eq(row?.rank, 0.25);
});

test('a warm cache still surfaces an error marker set after caching (review #3)', async () => {
  const engine = createEngine(makeDeps());
  const first = await req(engine, 'GET', '/tasks?adapter=github');
  eq((first.body as { tasks: { syncState: string }[] }).tasks[0]?.syncState, 'synced');
  failPatch = true;
  const bad = await req(engine, 'PATCH', `/tasks/github/${encodeURIComponent('owner/repo#1')}`, JSON.stringify({ title: 'x' }));
  eq(bad.status, 502);
  // The list is still served from the warm cache — but the row must show
  // the persisted error, not the stale 'synced' (review #3).
  const second = await req(engine, 'GET', '/tasks?adapter=github');
  const row = (second.body as { tasks: { syncState: string; syncError: string | null }[] }).tasks[0];
  eq(row?.syncState, 'error');
  ok(row?.syncError?.includes('write failed'));
});

test('adapters(): self-hosted store host counts as configured (gitlab.example.com, no gitlab.com token)', async () => {
  const deps = makeDeps();
  const store = JSON.stringify({ providers: { gitlab: { instances: { 'https://gitlab.example.com': {
    activeCredentialId: 'c1', credentials: [{ credentialId: 'c1', status: 'valid', token: 'GL' }] } } } } });
  const engine = createEngine({
    ...deps,
    adapters: [localAdapter, gitlabAdapter],
    settings: async () => '',
    auth: { readStore: async () => store, readSettings: async () => ({}), cliToken: async () => null },
    workspaceRemotes: async () => ['gitlab:gitlab.example.com/acme/app'],
  });
  const res = await engine.adapters();
  eq(res.adapters.find((a) => a.id === 'gitlab')?.configured, true);
});

test('adapters(): no token anywhere → not configured', async () => {
  const deps = makeDeps();
  const engine = createEngine({
    ...deps,
    adapters: [localAdapter, gitlabAdapter],
    settings: async () => '',
    auth: { readStore: async () => undefined, readSettings: async () => ({}), cliToken: async () => null },
    workspaceRemotes: async () => [],
  });
  const res = await engine.adapters();
  eq(res.adapters.find((a) => a.id === 'gitlab')?.configured, false);
  eq(res.adapters.find((a) => a.id === 'local')?.configured, true);
});

test('setLink patches cached rows without refetching every platform', async () => {
  failPatch = false;
  failList = false;
  const deps = makeDeps();
  const engine = createEngine(deps);
  listCalls = 0;
  const first = await engine.list({});
  eq(first.cached, false);
  eq(listCalls, 1);
  const row = first.tasks.find((t) => t.adapterId === 'github');
  ok(row);
  await engine.setLink('github', 'owner/repo#1', { needsAttentionSince: 42 });
  // No invalidation: the next list is served from memory, no new fan-out.
  const second = await engine.list({});
  eq(second.cached, true);
  eq(listCalls, 1);
  eq(second.tasks.find((t) => t.adapterId === 'github')?.needsAttentionSince, 42);
});

test('invalidate during an in-flight list drops its stale cache write', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let gatedCalls = 0;
  const gated: TaskAdapter = {
    ...stubRemote,
    async list(ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
      gatedCalls += 1;
      await gate;
      return stubRemote.list(ctx, scope);
    },
  };
  failPatch = false;
  failList = false;
  const deps = makeDeps();
  (deps as { adapters: TaskAdapter[] }).adapters = [gated];
  const engine = createEngine(deps);
  listCalls = 0;
  const pending = engine.list({});
  // Wait until the fan-out really started, then land a write mid-flight.
  for (let i = 0; i < 100 && gatedCalls === 0; i++) await new Promise((r) => setTimeout(r, 5));
  eq(gatedCalls, 1);
  await engine.patch('github', 'owner/repo#1', { title: 'edit', fromListId: 'open' });
  release();
  await pending;
  // The stale join must not repopulate memory: the next list fans out again.
  await engine.list({});
  eq(gatedCalls, 2);
});

test('options() caches per (adapter, project) and coalesces in-flight calls', async () => {
  let optionsCalls = 0;
  const optsAdapter: TaskAdapter = {
    ...stubRemote,
    capabilities: { create: true, delete: false, fields: { assignee: true, milestone: false, dueDate: false, labels: true } },
    async options(_ctx: Ctx, _projectRef: string): Promise<AdapterOptions> {
      optionsCalls += 1;
      return { people: [{ id: 'p1', name: 'Ada' }], milestones: [], labels: [] };
    },
  };
  const deps = makeDeps();
  deps.adapters = [optsAdapter];
  const engine = createEngine(deps);
  const first = await engine.options('github', 'github:owner/repo');
  eq(first.people[0]?.id, 'p1');
  const second = await engine.options('github', 'github:owner/repo');
  eq(optionsCalls, 1); // served from the 60 s memory cache
  eq(second, first);
});

test('destroy() deletes on the source, cleans overlay/error state and is idempotent on 404', async () => {
  const deps = makeDeps();
  await setOverlay(deps.storage, 'github', 'owner/repo#1', { sessionId: 's1' });
  let deleteCalls = 0;
  const destroyAdapter: TaskAdapter = {
    ...stubRemote,
    capabilities: { create: true, delete: true, fields: { assignee: false, milestone: false, dueDate: false, labels: false } },
    async delete(_ctx: Ctx, id: string): Promise<void> {
      deleteCalls += 1;
      if (id === 'owner/repo#1') return; // success
      throw new AdapterError(`gone: ${id}`, false, true); // notFound
    },
  };
  deps.adapters = [destroyAdapter];
  const engine = createEngine(deps);
  const out = await engine.destroy('github', 'owner/repo#1');
  deep(out, { destroyed: true });
  eq(deleteCalls, 1);
  eq(await getOverlay(deps.storage, 'github', 'owner/repo#1'), null);
  // Idempotent: a notFound delete still completes the cleanup.
  await engine.destroy('github', 'owner/repo#404');
  eq(deleteCalls, 2);
});

test('destroy() propagates non-notFound adapter errors', async () => {
  const deps = makeDeps();
  const failing: TaskAdapter = {
    ...stubRemote,
    capabilities: { create: true, delete: true, fields: { assignee: false, milestone: false, dueDate: false, labels: false } },
    async delete(): Promise<void> { throw new AdapterError('no permission', false); },
  };
  deps.adapters = [failing];
  const engine = createEngine(deps);
  await assert.rejects(() => engine.destroy('github', 'owner/repo#1'), /no permission/);
});

test('GET /adapters entries carry capabilities', async () => {
  const engine = createEngine(makeDeps());
  const res = await req(engine, 'GET', '/adapters');
  const local = (res.body as { adapters: { id: string; capabilities?: AdapterCapabilities }[] }).adapters.find((a) => a.id === 'local');
  eq(local?.capabilities?.delete, true);
});

test('GET /options requires adapter and project; serves the engine cache', async () => {
  const engine = createEngine(makeDeps());
  const missing = await req(engine, 'GET', '/options');
  eq(missing.status, 400);
  const ok = await req(engine, 'GET', '/options?adapter=local&project=x');
  eq(ok.status, 200);
  deep(ok.body, { people: [], milestones: [], labels: [] });
});

test('POST /tasks/:a/:id/destroy deletes via the engine; unknown adapter → 404', async () => {
  const deps = makeDeps();
  const engine = createEngine(deps);
  const created = await req(engine, 'POST', '/tasks', JSON.stringify({ adapterId: 'local', title: 'Doomed' }));
  const id = ((created.body as { task?: { externalId?: string } }).task?.externalId) ?? '';
  eq((await req(engine, 'POST', `/tasks/local/${encodeURIComponent(id)}/destroy`)).status, 200);
  const unknown = await req(engine, 'POST', '/tasks/nope/x/destroy');
  eq(unknown.status, 404);
});

test('sanitizePatch: malformed dueDate → 400; valid field edits pass through', async () => {
  const deps = makeDeps();
  const engine = createEngine(deps);
  // A malformed dueDate is dropped → the patch is empty → 400.
  eq((await req(engine, 'PATCH', '/tasks/local/x', JSON.stringify({ dueDate: '01-12-2026' }))).status, 400);
  // A valid assignee (over-long input is sliced to 256) reaches the engine;
  // the unknown local task fails with a retryable error → 502.
  eq((await req(engine, 'PATCH', '/tasks/local/x', JSON.stringify({ assignee: 'x'.repeat(300), dueDate: '2026-12-01' }))).status, 502);
});
