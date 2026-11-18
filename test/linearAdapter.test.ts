// test/linearAdapter.test.ts — fixture HTTP, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearAdapter } from '../src/adapters/linear.ts';
import { AdapterError, type Ctx, type Scope } from '../src/adapters/types.ts';
import { makeAdapterCtx, type FixtureSeen, type FixtureReply } from './helpers.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

const makeCtx = (
  handler: (req: { method: string; url: string; bodyText: string }, call: number) => FixtureReply,
  opts?: { settings?: Record<string, string | null> },
): { ctx: Ctx; seen: FixtureSeen } => makeAdapterCtx(handler, opts);

const auth = { settings: { 'linear-token': 'LIN' } };
const gql = (data: unknown): { status: number; body: unknown } => ({ status: 200, body: { data } });
const issue = (over: Record<string, unknown> = {}): unknown => ({
  id: 'issue-uuid-1', identifier: 'APP-1', title: 'Wire the shell',
  description: 'notes', url: 'https://linear.app/app/issue/1',
  state: { id: 'state-todo', name: 'Todo' },
  assignee: { name: 'me' }, labels: { nodes: [{ name: 'bug' }] },
  updatedAt: '2026-01-02T03:04:05.000Z', dueDate: '2026-12-01', ...over,
});
const scope: Scope = { repos: ['linear:APP'], assignee: null };

test('list maps issues with workflow state → listId, identifier → externalId', async () => {
  const { ctx, seen } = makeCtx(({ bodyText }) => {
    ok(bodyText.includes('issues('));
    return gql({ issues: { nodes: [issue(), issue({ id: 'i2', identifier: 'APP-2', state: { id: 'state-done', name: 'Done' } })] } });
  }, auth);
  const tasks = await linearAdapter.list(ctx, scope);
  eq(tasks.length, 2);
  eq(tasks[0]?.externalId, 'APP#APP-1');
  eq(tasks[0]?.listId, 'state-todo');
  eq(tasks[1]?.listId, 'state-done');
  deep(tasks[0]?.labels, ['bug']);
  eq(tasks[0]?.assignee, 'me');
  eq(tasks[0]?.dueDate, '2026-12-01');
  ok(seen[0]?.headers.Authorization === 'LIN');
});

test('missing token → not retryable, no fetch', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: {} }), { settings: {} });
  await assert.rejects(() => linearAdapter.list(ctx, scope), (e: unknown) => e instanceof AdapterError && !e.retryable && seen.length === 0);
});

// Mutations need the uuid, so every update test first resolves the issue
// by identifier: fixture switches on the query shape.
const withLookup = (mutationBody: unknown) => ({ bodyText }: { bodyText: string }) =>
  bodyText.includes('issueSearch') ? gql({ issueSearch: { nodes: [issue()] } }) : { status: 200, body: mutationBody };

test('move issues issueUpdate with the new state id', async () => {
  const { ctx, seen } = makeCtx(withLookup({ issueUpdate: { success: true } }), auth);
  await linearAdapter.update(ctx, 'APP#APP-1', { listId: 'state-done', fromListId: 'state-todo' });
  const mutation = seen[seen.length - 1]?.bodyText ?? '';
  ok(mutation.includes('issueUpdate'));
  ok(mutation.includes('state-done'));
});

test('update title/description; label changes are refused loudly, never mis-sent', async () => {
  const { ctx, seen } = makeCtx(withLookup({ issueUpdate: { success: true } }), auth);
  await linearAdapter.update(ctx, 'APP#APP-1', { title: 'T2', description: 'D2' });
  ok((seen[seen.length - 1]?.bodyText ?? '').includes('T2'));
  await assert.rejects(
    () => linearAdapter.update(ctx, 'APP#APP-1', { labels: ['x'] }),
    (e: unknown) => e instanceof AdapterError && !e.retryable,
  );
  await assert.rejects(
    () => linearAdapter.update(ctx, 'APP#APP-1', { addLabels: ['x'], fromListId: 'open' }),
    (e: unknown) => e instanceof AdapterError && !e.retryable,
  );
});

test('create issues issueCreate and returns the composite id its own get() accepts (review #2)', async () => {
  const { ctx } = makeCtx(({ bodyText }) => {
    if (bodyText.includes('teams(')) return gql({ teams: { nodes: [{ id: 'team-uuid' }] } });
    if (bodyText.includes('issueCreate')) return gql({ issueCreate: { success: true, issue: { id: 'new-uuid', identifier: 'APP-33' } } });
    return gql({ issueSearch: { nodes: [issue({ id: 'new-uuid', identifier: 'APP-33' })] } });
  }, auth);
  const id = await linearAdapter.create(ctx, { projectRef: 'linear:APP', title: 'New', description: 'D' });
  eq(id, 'APP#APP-33');
  // Round-trip: get() by that composite id finds the issue.
  const got = await linearAdapter.get(ctx, id);
  eq(got?.externalId, 'APP#APP-33');
  // A create response without an identifier is refused, not returned
  // unreadable (bare uuid would break get()).
  const { ctx: ctx2 } = makeCtx(({ bodyText }) => {
    if (bodyText.includes('teams(')) return gql({ teams: { nodes: [{ id: 'team-uuid' }] } });
    return gql({ issueCreate: { success: true, issue: { id: 'bare-uuid' } } });
  }, auth);
  await assert.rejects(() => linearAdapter.create(ctx2, { projectRef: 'linear:APP', title: 'N', description: '' }));
});

test('GraphQL auth error → not retryable; malformed payload skipped', async () => {
  const { ctx } = makeCtx(() => ({ status: 200, body: { errors: [{ message: 'auth', extensions: { code: 'AUTH' } }] } }), auth);
  await assert.rejects(() => linearAdapter.list(ctx, scope), (e: unknown) => e instanceof AdapterError && !e.retryable);
  const { ctx: ctx2 } = makeCtx(() => gql({ issues: { nodes: [issue(), { garbage: 1 }, issue({ identifier: null })] } }), auth);
  eq((await linearAdapter.list(ctx2, scope)).length, 1);
});

test('capabilities: assignee/dueDate/labels editable, no milestone, delete supported', () => {
  eq(linearAdapter.capabilities.delete, true);
  eq(linearAdapter.capabilities.fields.milestone, false);
  eq(linearAdapter.capabilities.fields.assignee, true);
  eq(linearAdapter.capabilities.fields.labels, true);
});

test('options lists team members and team-scoped labels', async () => {
  const { ctx } = makeCtx(({ bodyText }) => {
    ok(bodyText.includes('members'));
    return { status: 200, body: { data: { teams: { nodes: [{
      members: { nodes: [{ id: 'u1', name: 'Ada', displayName: 'Ada L.' }] },
      issueLabels: { nodes: [{ id: 'lab1', name: 'bug' }] },
    }] } } } };
  }, auth);
  const opts = await linearAdapter.options(ctx, 'linear:APP');
  // Board name (assignee.name) first so the select matches the row.
  deep(opts.people, [{ id: 'u1', name: 'Ada' }]);
  deep(opts.milestones, []);
  deep(opts.labels, ['bug']);
});

test('delete calls issueDelete with the uuid', async () => {
  const { ctx, seen } = makeCtx(({ bodyText }) => {
    if (bodyText.includes('issueDelete')) return gql({ issueDelete: { success: true } });
    if (bodyText.includes('issueSearch')) return gql({ issueSearch: { nodes: [issue({ id: 'uuid-1' })] } });
    return { status: 200, body: { data: {} } };
  }, auth);
  await linearAdapter.delete(ctx, 'APP#APP-1');
  ok(seen.some((r) => r.bodyText.includes('issueDelete') && r.bodyText.includes('uuid-1')));
});

test('delete of an already-missing issue is notFound for idempotent engine cleanup', async () => {
  const { ctx } = makeCtx(({ bodyText }) => {
    if (bodyText.includes('issueSearch')) return gql({ issueSearch: { nodes: [] } });
    return { status: 200, body: { data: {} } };
  }, auth);
  await assert.rejects(() => linearAdapter.delete(ctx, 'APP#APP-404'),
    (e: unknown) => e instanceof AdapterError && e.notFound && !e.retryable);
});

test('update writes assigneeId, dueDate and labelIds (names resolved via team labels)', async () => {
  const { ctx, seen } = makeCtx(({ bodyText }) => {
    if (bodyText.includes('issueUpdate')) return gql({ issueUpdate: { success: true } });
    if (bodyText.includes('issueSearch')) {
      return gql({ issueSearch: { nodes: [issue({ id: 'uuid-1', labels: { nodes: [{ name: 'bug' }] } })] } });
    }
    if (bodyText.includes('issueLabels')) {
      return gql({ teams: { nodes: [{
        members: { nodes: [] },
        issueLabels: { nodes: [{ id: 'lab1', name: 'bug' }, { id: 'lab2', name: 'ui' }] },
      }] } });
    }
    return { status: 200, body: { data: {} } };
  }, auth);
  await linearAdapter.update(ctx, 'APP#APP-1', { assigneeId: 'u9', dueDate: '2026-12-01', addLabels: ['ui'] });
  const mutation = seen.find((r) => r.bodyText.includes('issueUpdate'))!;
  const vars = JSON.parse(mutation.bodyText).variables.input as Record<string, unknown>;
  eq(vars.assigneeId, 'u9');
  eq(vars.dueDate, '2026-12-01');
  deep(vars.labelIds, ['lab1', 'lab2']); // current 'bug' preserved + 'ui' added
});
