// test/trelloAdapter.test.ts — fixture HTTP, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { trelloAdapter } from '../src/adapters/trello.ts';
import { AdapterError, type Ctx, type Scope } from '../src/adapters/types.ts';
import { makeAdapterCtx, type FixtureSeen, type FixtureReply } from './helpers.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

const makeCtx = (
  handler: (req: { method: string; url: string }, call: number) => FixtureReply,
  opts?: { settings?: Record<string, string | null> },
): { ctx: Ctx; seen: FixtureSeen } => makeAdapterCtx(handler, opts);

const auth = { settings: { 'trello-key': 'KEY', 'trello-token': 'TOK' } };
const card = (over: Record<string, unknown> = {}): unknown => ({
  id: 'card1', name: 'Ship the board', desc: 'notes',
  url: 'https://trello.com/c/card1', idList: 'listA',
  labels: [{ name: 'p1' }], dateLastActivity: '2026-01-02T03:04:05.000Z',
  due: '2026-12-01T00:00:00.000Z', members: [{ id: 'm1', fullName: 'Ada L.', username: 'ada' }], ...over,
});
const scope: Scope = { repos: ['trello:board1'], assignee: null };

test('capabilities tell the detail UI to use option-backed labels', () => {
  eq(trelloAdapter.capabilities.labelsFromOptions, true);
  eq(trelloAdapter.capabilities.fields.labels, true);
});

test('list maps cards to RemoteTask (idList → listId), key+token in query', async () => {
  const { ctx, seen } = makeCtx(({ url }) => (url.includes('/boards/board1/cards') ? { status: 200, body: [card()] } : { status: 404 }), auth);
  const tasks = await trelloAdapter.list(ctx, scope);
  eq(tasks.length, 1);
  eq(tasks[0]?.externalId, 'board1#card1');
  eq(tasks[0]?.listId, 'listA');
  eq(tasks[0]?.projectRef, 'trello:board1');
  deep(tasks[0]?.labels, ['p1']);
  // Read-backs: due date and first member round-trip into the row.
  eq(tasks[0]?.dueDate, '2026-12-01T00:00:00.000Z');
  eq(tasks[0]?.assignee, 'Ada L.');
  ok(seen[0]?.url.includes('/boards/board1/cards?members=true'));
  ok(seen[0]?.url.includes('key=KEY'));
  ok(seen[0]?.url.includes('token=TOK'));
});

test('missing key or token → not retryable, no fetch', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: [] }), { settings: { 'trello-key': 'KEY' } });
  await assert.rejects(() => trelloAdapter.list(ctx, scope), (e: unknown) => e instanceof AdapterError && !e.retryable && seen.length === 0);
});

test('move changes idList keeping other fields', async () => {
  const { ctx, seen } = makeCtx(({ method }) => (method === 'PUT' ? { status: 200, body: {} } : { status: 404 }), auth);
  await trelloAdapter.update(ctx, 'board1#card1', { listId: 'listB', fromListId: 'listA' });
  eq(seen[0]?.method, 'PUT');
  ok(seen[0]?.url.includes('/cards/card1'));
  ok(seen[0]?.url.includes('idList=listB'));
});

test('update title/desc; explicit labels replace via resolved label ids', async () => {
  const boardLabels = [{ id: 'id-a', name: 'a' }, { id: 'id-b', name: 'b' }, { id: 'id-c', name: 'c' }];
  const { ctx, seen } = makeCtx(({ method, url }) => {
    if (method === 'GET' && url.includes('/labels')) return { status: 200, body: boardLabels };
    if (method === 'GET') return { status: 200, body: card({ id: 'card1', labels: [{ name: 'a' }, { name: 'c' }] }) };
    return { status: 200, body: {} };
  }, auth);
  await trelloAdapter.update(ctx, 'board1#card1', { title: 'T2', description: 'D2' });
  ok(seen[0]?.url.includes('name=T2'));
  ok(seen[0]?.url.includes('desc=D2'));
  await trelloAdapter.update(ctx, 'board1#card1', { labels: ['a', 'b'] });
  const replace = seen.find((r) => r.method === 'PUT' && r.url.includes('idLabels='));
  ok(replace?.url.includes('idLabels=id-a,id-b'));
  // add/remove merge with the card's current labels, names resolved to ids.
  await trelloAdapter.update(ctx, 'board1#card1', { addLabels: ['b'], removeLabels: ['c'], fromListId: 'listA' });
  const merge = seen.filter((r) => r.method === 'PUT' && r.url.includes('idLabels=')).pop();
  ok(merge?.url.includes('idLabels=id-a,id-b'));
  // Unknown label names fail loudly instead of reporting success.
  await assert.rejects(() => trelloAdapter.update(ctx, 'board1#card1', { addLabels: ['nope'], fromListId: 'listA' }));
});

test('create lands in the first list, returns the composite id its own get() accepts (review #2)', async () => {
  const { ctx } = makeCtx(({ url, method }) => {
    if (url.includes('/lists') && method === 'GET') return { status: 200, body: [{ id: 'firstList' }, { id: 'secondList' }] };
    if (method === 'POST') return { status: 200, body: { id: 'newCard' } };
    if (url.includes('/cards/newCard') && method === 'GET') return { status: 200, body: card({ id: 'newCard' }) };
    return { status: 404 };
  }, auth);
  const id = await trelloAdapter.create(ctx, { projectRef: 'trello:board1', title: 'New', description: 'D' });
  eq(id, 'board1#newCard');
  // Round-trip.
  const got = await trelloAdapter.get(ctx, id);
  eq(got?.externalId, 'board1#newCard');
});

test('capabilities: assignee/dueDate/labels editable, no milestone', () => {
  eq(trelloAdapter.capabilities.delete, true);
  eq(trelloAdapter.capabilities.fields.milestone, false);
  eq(trelloAdapter.capabilities.fields.dueDate, true);
});

test('options lists board members and named labels (unnamed color labels skipped)', async () => {
  const { ctx } = makeCtx(({ url }) => {
    if (url.includes('/members')) return { status: 200, body: [{ id: 'm1', fullName: 'Ada L.', username: 'ada' }] };
    if (url.includes('/labels')) return { status: 200, body: [{ id: 'l1', name: 'red' }, { id: 'l2', name: '' }] };
    return { status: 404 };
  }, auth);
  const opts = await trelloAdapter.options(ctx, 'trello:board1');
  deep(opts.people, [{ id: 'm1', name: 'Ada L.' }]);
  deep(opts.milestones, []);
  deep(opts.labels, ['red']);
});

test('delete removes the card; 404 becomes notFound', async () => {
  const okCtx = makeCtx(({ method, url }) => {
    eq(method, 'DELETE');
    ok(url.includes('/cards/'));
    return { status: 200, body: null };
  }, auth);
  await trelloAdapter.delete(okCtx.ctx, 'board1#card1');
  const goneCtx = makeCtx(() => ({ status: 404 }), auth);
  await assert.rejects(() => trelloAdapter.delete(goneCtx.ctx, 'board1#card1'),
    (e: unknown) => e instanceof AdapterError && e.notFound);
});

test('update sets due (null clears) and replaces members; clear removes existing members', async () => {
  const { ctx, seen } = makeCtx(({ method, url }) => {
    if (method === 'GET' && url.includes('/cards/card1?members=true')) {
      return { status: 200, body: { id: 'card1', members: [{ id: 'm1' }, { id: 'm2' }] } };
    }
    return { status: 200, body: null };
  }, auth);
  await trelloAdapter.update(ctx, 'board1#card1', { dueDate: '2026-12-01', assigneeId: 'm3' });
  const put = seen[0]!;
  ok(put.method === 'PUT' && put.url.includes('due=2026-12-01'));
  ok(put.url.includes('idMembers=m3'));
  await trelloAdapter.update(ctx, 'board1#card1', { dueDate: null, assigneeId: null });
  ok(seen.some((r) => r.method === 'DELETE' && r.url.includes('/idMembers/m1')));
  ok(seen.some((r) => r.method === 'DELETE' && r.url.includes('/idMembers/m2')));
});

test('401 → not retryable; 500 → retryable; bad payload skipped', async () => {
  const statuses = [401, 500];
  let call = 0;
  const { ctx } = makeCtx(() => ({ status: statuses[call++] ?? 200, body: {} }), auth);
  const run = (): Promise<AdapterError> =>
    trelloAdapter.list(ctx, scope).then(
      () => { throw new Error('expected AdapterError'); },
      (e) => (e instanceof AdapterError ? e : (() => { throw e; })()),
    );
  eq((await run()).retryable, false);
  eq((await run()).retryable, true);
  const { ctx: ctx2 } = makeCtx(() => ({ status: 200, body: [card(), { garbage: 1 }, card({ id: 42 })] }), auth);
  eq((await trelloAdapter.list(ctx2, scope)).length, 1);
});
