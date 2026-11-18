// test/localAdapter.test.ts — in-memory host.storage fake
import test from 'node:test';
import assert from 'node:assert/strict';
import { localAdapter } from '../src/adapters/local.ts';
import { createLocalTask } from '../src/domain/task.ts';
import { deleteLocalTask, saveLocalTask, taskKey, TASK_KEY_PREFIX } from '../src/store/taskStore.ts';
import { setOverlay, getOverlay, deleteOverlay, OVERLAY_KEY_PREFIX } from '../src/store/overlayStore.ts';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../src/store/prefs.ts';
import { AdapterError, type Ctx, type StorageClient } from '../src/adapters/types.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;

const memStorage = (): StorageClient => {
  const m = new Map<string, unknown>();
  return {
    keys: async () => [...m.keys()],
    get: async (key) => m.get(key),
    set: async (key, value) => { m.set(key, value); },
    delete: async (key) => { m.delete(key); },
  };
};

let seq = 0;
const makeCtx = (): Ctx => ({
  storage: memStorage(),
  settings: async () => null,
  fetch: (async () => { throw new Error('no fetch in this test'); }) as Ctx['fetch'],
  now: () => 1000,
  newId: () => `id-${++seq}`,
  auth: { readStore: async () => undefined, readSettings: async () => ({}), cliToken: async () => null },
});

test('local create/list round-trips, one key per task (plan excerpt)', async () => {
  const ctx = makeCtx();
  const id = await localAdapter.create(ctx, { projectRef: null, title: 'T', description: 'D' });
  const listed = await localAdapter.list(ctx, { repos: [], assignee: null });
  assert.ok(listed.some((t) => t.externalId === id));
  const keys = (await ctx.storage.keys()).filter((k) => k.startsWith(TASK_KEY_PREFIX));
  assert.equal(keys.length, 1);
  assert.equal(keys[0], 'task:t_id-1');
});

test('local get/update reflect patches, update of missing throws', async () => {
  const ctx = makeCtx();
  const id = await localAdapter.create(ctx, { projectRef: null, title: 'First', description: '' });
  const got = await localAdapter.get(ctx, id);
  assert.ok(got);
  assert.equal(got?.title, 'First');
  await localAdapter.update(ctx, id, { title: 'Second', listId: 'done' });
  const after = await localAdapter.get(ctx, id);
  assert.equal(after?.title, 'Second');
  assert.equal(after?.listId, 'done');
  assert.equal(after?.status, 'done');
  await assert.rejects(() => localAdapter.update(ctx, 'missing', { title: 'x' }), /not-found/);
});

test('taskStore.deleteLocalTask removes the record', async () => {
  const ctx = makeCtx();
  const id = await localAdapter.create(ctx, { projectRef: null, title: 'Gone', description: '' });
  await deleteLocalTask(ctx.storage, `t_${id}`);
  const listed = await localAdapter.list(ctx, { repos: [], assignee: null });
  assert.equal(listed.length, 0);
});

test('malformed records are skipped, not fatal', async () => {
  const ctx = makeCtx();
  await localAdapter.create(ctx, { projectRef: null, title: 'Good', description: '' });
  await ctx.storage.set('task:bad', { garbage: true });
  await ctx.storage.set('task:worse', 'string record');
  const listed = await localAdapter.list(ctx, { repos: [], assignee: null });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.title, 'Good');
});

test('overlay set/get/clear isolated per remote task', async () => {
  const ctx = makeCtx();
  await setOverlay(ctx.storage, 'github', '12', { sessionId: 's1', rank: 0.25, needsAttentionSince: 500 });
  await setOverlay(ctx.storage, 'gitlab', '12', { sessionId: 's2' });
  const a = await getOverlay(ctx.storage, 'github', '12');
  const b = await getOverlay(ctx.storage, 'gitlab', '12');
  assert.equal(a?.sessionId, 's1');
  assert.equal(a?.rank, 0.25);
  assert.equal(b?.sessionId, 's2');
  assert.equal(b?.rank, null);
  await setOverlay(ctx.storage, 'github', '12', { sessionId: null });
  const cleared = await getOverlay(ctx.storage, 'github', '12');
  assert.equal(cleared?.sessionId, null);
  assert.equal(cleared?.rank, 0.25);
  await deleteOverlay(ctx.storage, 'gitlab', '12');
  assert.equal(await getOverlay(ctx.storage, 'gitlab', '12'), null);
  assert.ok((await ctx.storage.keys()).every((k) => k.startsWith(OVERLAY_KEY_PREFIX) ? k !== 'meta:gitlab:12' : true));
});

test('overlay survives malformed stored record defensively', async () => {
  const ctx = makeCtx();
  await ctx.storage.set('meta:github:7', { sessionId: 42, rank: 'x' });
  const o = await getOverlay(ctx.storage, 'github', '7');
  assert.equal(o, null);
  await setOverlay(ctx.storage, 'github', '7', { sessionId: 'ok' });
  assert.equal((await getOverlay(ctx.storage, 'github', '7'))?.sessionId, 'ok');
});

test('prefs viewMode persists and falls back to default on garbage', async () => {
  const ctx = makeCtx();
  const p0 = await loadPrefs(ctx.storage);
  assert.equal(p0.viewMode, 'table');
  await savePrefs(ctx.storage, { ...p0, viewMode: 'kanban' });
  assert.equal((await loadPrefs(ctx.storage)).viewMode, 'kanban');
  await ctx.storage.set('prefs', { viewMode: 'bogus' });
  assert.equal((await loadPrefs(ctx.storage)).viewMode, 'table');
});

test('prefs persist the project filter (review #6)', async () => {
  const ctx = makeCtx();
  const p0 = await loadPrefs(ctx.storage);
  assert.equal(p0.project, 'all');
  await savePrefs(ctx.storage, { ...p0, project: 'github:owner/app' });
  assert.equal((await loadPrefs(ctx.storage)).project, 'github:owner/app');
  await ctx.storage.set('prefs', { project: 42 });
  assert.equal((await loadPrefs(ctx.storage)).project, 'all');
});

test('prefs persist collapsed kanban columns (review UX round 2)', async () => {
  const ctx = makeCtx();
  const p0 = await loadPrefs(ctx.storage);
  assert.deepEqual(p0.collapsed, []);
  await savePrefs(ctx.storage, { ...p0, collapsed: ['todo', 'done'] });
  const loaded = await loadPrefs(ctx.storage);
  deep(loaded.collapsed, ['todo', 'done']);
  // Garbage entries are dropped, not fatal.
  await ctx.storage.set('prefs', { collapsed: ['todo', 42, ''] });
  deep((await loadPrefs(ctx.storage)).collapsed, ['todo']);
});

test('prefs persist the kanban column order (review UX round 2)', async () => {
  const ctx = makeCtx();
  assert.deepEqual((await loadPrefs(ctx.storage)).columnOrder, []);
  await savePrefs(ctx.storage, { ...DEFAULT_PREFS, columnOrder: ['done', 'todo'] });
  deep((await loadPrefs(ctx.storage)).columnOrder, ['done', 'todo']);
  await ctx.storage.set('prefs', { columnOrder: ['ok', 7, 'in progress'] });
  deep((await loadPrefs(ctx.storage)).columnOrder, ['ok', 'in progress']);
});

test('local create honors listId as status and marks closed for done', async () => {
  const ctx = makeCtx();
  const id = await localAdapter.create(ctx, { projectRef: null, title: 'In review', description: '', listId: 'review' });
  const got = await localAdapter.get(ctx, id);
  eq(got?.listId, 'review');
  eq(got?.status, 'review');
  eq(got?.closed, false);
  const id2 = await localAdapter.create(ctx, { projectRef: null, title: 'Done', description: '', listId: 'done' });
  eq((await localAdapter.get(ctx, id2))?.closed, true);
});

test('local adapter declares lifecycle capabilities, deletes and lists labels', async () => {
  eq(localAdapter.capabilities.create, true);
  eq(localAdapter.capabilities.delete, true);
  eq(localAdapter.capabilities.fields.labels, true);
  eq(localAdapter.capabilities.fields.assignee, false);
  eq(localAdapter.capabilities.fields.milestone, false);
  eq(localAdapter.capabilities.fields.dueDate, false);

  const ctx = makeCtx();
  const task = createLocalTask({ id: 'x', title: 'X', status: 'todo', now: 1 });
  task.labels = ['urgent'];
  await saveLocalTask(ctx.storage, task);
  await localAdapter.delete(ctx, 'x');
  eq(await ctx.storage.get(taskKey('t_x')), undefined);
  await assert.rejects(() => localAdapter.delete(ctx, 'x'),
    (e: unknown) => e instanceof AdapterError && e.notFound);

  await saveLocalTask(ctx.storage, task);
  const opts = await localAdapter.options(ctx, '');
  deep(opts, { people: [], milestones: [], labels: ['urgent'] });
});
