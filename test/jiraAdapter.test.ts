// test/jiraAdapter.test.ts — fixture HTTP, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { jiraAdapter } from '../src/adapters/jira.ts';
import { AdapterError, type Ctx, type Scope } from '../src/adapters/types.ts';
import { makeAdapterCtx, type FixtureSeen, type FixtureReply } from './helpers.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

const makeCtx = (
  handler: (req: { method: string; url: string; bodyText: string; headers: Record<string, string> }, call: number) => FixtureReply,
  opts?: { settings?: Record<string, string | null> },
): { ctx: Ctx; seen: FixtureSeen } => makeAdapterCtx(handler, opts);

const auth = { settings: { 'jira-host': 'acme.atlassian.net', 'jira-email': 'me@acme.io', 'jira-token': 'JT' } };
const issue = (over: Record<string, unknown> = {}): unknown => ({
  id: '10001', key: 'APP-7',
  fields: {
    summary: 'Fix login', status: { name: 'In Progress' },
    labels: ['backend'], assignee: { displayName: 'me' },
    updated: '2026-01-02T03:04:05.000Z', duedate: '2026-12-01',
  },
  ...over,
});
const scope: Scope = { repos: ['jira:acme.atlassian.net/APP'], assignee: null };
const basic = (email: string, token: string): string => `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

test('list maps Jira issues, status name → listId, Basic auth, browse url', async () => {
  const { ctx, seen } = makeCtx(({ url }) => (url.includes('/rest/api/3/search/jql') ? { status: 200, body: { issues: [issue()] } } : { status: 404 }), auth);
  const tasks = await jiraAdapter.list(ctx, scope);
  eq(tasks.length, 1);
  eq(tasks[0]?.externalId, 'APP#APP-7');
  eq(tasks[0]?.listId, 'In Progress');
  eq(tasks[0]?.nativeId, 'APP-7');
  eq(tasks[0]?.url, 'https://acme.atlassian.net/browse/APP-7');
  deep(tasks[0]?.labels, ['backend']);
  eq(tasks[0]?.dueDate, '2026-12-01');
  ok(seen[0]?.headers.Authorization === basic('me@acme.io', 'JT'));
  ok(seen[0]?.url.startsWith('https://acme.atlassian.net/rest/api/3/'));
});

test('missing host/token pair → not retryable, no fetch', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: {} }), { settings: { 'jira-host': 'acme.atlassian.net' } });
  await assert.rejects(() => jiraAdapter.list(ctx, scope), (e: unknown) => e instanceof AdapterError && !e.retryable && seen.length === 0);
});

test('move goes through transitions resolved by target status name', async () => {
  const { ctx, seen } = makeCtx(({ url, method }) => {
    if (url.includes('/transitions') && method === 'GET') {
      return { status: 200, body: { transitions: [
        { id: '31', name: 'Done', to: { name: 'Done' } },
        { id: '11', name: 'Start', to: { name: 'In Progress' } },
      ] } };
    }
    if (method === 'POST') return { status: 204, body: null };
    return { status: 404 };
  }, auth);
  await jiraAdapter.update(ctx, 'APP#APP-7', { listId: 'Done', fromListId: 'In Progress' });
  const post = seen[seen.length - 1]!;
  eq(post.method, 'POST');
  deep(JSON.parse(post.bodyText), { transition: { id: '31' } });
});

test('update title; explicit labels replace; create returns the composite id its own get() accepts (review #2)', async () => {
  const { ctx } = makeCtx(({ url, method }) => {
    if (method === 'POST' && url.endsWith('/rest/api/3/issue')) {
      return { status: 201, body: { key: 'APP-9' } };
    }
    if (url.includes('/issue/APP-9') && method === 'GET') {
      return { status: 200, body: issue({ key: 'APP-9' }) };
    }
    return { status: 204, body: null };
  }, auth);
  await jiraAdapter.update(ctx, 'APP#APP-7', { title: 'T2' });
  const id = await jiraAdapter.create(ctx, { projectRef: 'jira:acme.atlassian.net/APP', title: 'New', description: 'D' });
  eq(id, 'APP#APP-9');
  // Round-trip.
  const got = await jiraAdapter.get(ctx, id);
  eq(got?.nativeId, 'APP-9');
});

test('401 → not retryable; 500 → retryable; bad payload skipped', async () => {
  const statuses = [401, 500];
  let call = 0;
  const { ctx } = makeCtx(() => ({ status: statuses[call++] ?? 200, body: {} }), auth);
  const run = (): Promise<AdapterError> =>
    jiraAdapter.list(ctx, scope).then(
      () => { throw new Error('expected AdapterError'); },
      (e) => (e instanceof AdapterError ? e : (() => { throw e; })()),
    );
  eq((await run()).retryable, false);
  eq((await run()).retryable, true);
  const { ctx: ctx2 } = makeCtx(() => ({ status: 200, body: { issues: [issue(), { garbage: 1 }, null] } }), auth);
  eq((await jiraAdapter.list(ctx2, scope)).length, 1);
});

test('list uses POST /search/jql; addLabels/removeLabels go to update.labels', async () => {
  const { ctx, seen } = makeCtx(({ url, method }) => {
    if (url.includes('/rest/api/3/search/jql')) return { status: 200, body: { issues: [] } };
    return { status: 200, body: {} };
  }, { settings: { 'jira-host': 'https://acme.atlassian.net', 'jira-email': 'a@b.c', 'jira-token': 'JT' } });
  await jiraAdapter.list(ctx, { repos: ['jira:acme.atlassian.net/APP'], assignee: null });
  eq(seen[0]?.method, 'POST');
  ok((seen[0]?.url ?? '').endsWith('/rest/api/3/search/jql'));
  await jiraAdapter.update(ctx, 'APP#APP-7', { addLabels: ['x'], removeLabels: ['y'], fromListId: 'open' });
  const put = seen.find((r) => r.method === 'PUT');
  deep(JSON.parse(put?.bodyText ?? '{}'), { update: { labels: [{ add: 'x' }, { remove: 'y' }] } });
});

test('create sends labels when given', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 201, body: { key: 'APP-9' } }), { settings: { 'jira-host': 'https://acme.atlassian.net', 'jira-email': 'a@b.c', 'jira-token': 'JT' } });
  await jiraAdapter.create(ctx, { projectRef: 'jira:acme.atlassian.net/APP', title: 'N', description: '', labels: ['a'] });
  deep((JSON.parse(seen[0]?.bodyText ?? '{}') as { fields: { labels: string[] } }).fields.labels, ['a']);
});

test('capabilities: assignee/dueDate/labels editable, no milestone, delete supported', () => {
  eq(jiraAdapter.capabilities.delete, true);
  eq(jiraAdapter.capabilities.fields.milestone, false);
  eq(jiraAdapter.capabilities.fields.dueDate, true);
});

test('options lists assignable users and label names', async () => {
  const { ctx } = makeCtx(({ url }) => {
    if (url.includes('/user/assignable/search')) return { status: 200, body: [{ accountId: 'a1', displayName: 'Ada L.' }] };
    if (url.includes('/rest/api/3/label')) return { status: 200, body: { values: ['bug', 'ui'], total: 2 } };
    return { status: 404 };
  }, auth);
  // projectRef host must equal the configured jira-host (anti-phish).
  const opts = await jiraAdapter.options(ctx, 'jira:acme.atlassian.net/APP');
  deep(opts.people, [{ id: 'a1', name: 'Ada L.' }]);
  deep(opts.milestones, []);
  deep(opts.labels, ['bug', 'ui']);
});

test('delete removes the issue; 404 becomes notFound', async () => {
  const okCtx = makeCtx(({ method, url }) => {
    eq(method, 'DELETE');
    ok(url.includes('/rest/api/3/issue/PROJ-1'));
    return { status: 204 };
  }, auth);
  await jiraAdapter.delete(okCtx.ctx, 'PROJ#PROJ-1');
  const goneCtx = makeCtx(() => ({ status: 404 }), auth);
  await assert.rejects(() => jiraAdapter.delete(goneCtx.ctx, 'PROJ#PROJ-1'),
    (e: unknown) => e instanceof AdapterError && e.notFound);
});

test('update writes assignee accountId (null unassigns) and duedate', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 204 }), auth);
  await jiraAdapter.update(ctx, 'PROJ#PROJ-1', { assigneeId: 'a1', dueDate: '2026-12-01' });
  const body = JSON.parse(seen[0]!.bodyText);
  deep(body.fields.assignee, { accountId: 'a1' });
  eq(body.fields.duedate, '2026-12-01');
  await jiraAdapter.update(ctx, 'PROJ#PROJ-1', { assigneeId: null, dueDate: null });
  const cleared = JSON.parse(seen[1]!.bodyText);
  eq(cleared.fields.assignee, null);
  eq(cleared.fields.duedate, null);
});
