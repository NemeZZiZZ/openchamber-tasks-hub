// test/githubAdapter.test.ts — fixture HTTP, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { githubAdapter } from '../src/adapters/github.ts';
import { AdapterError, type Ctx, type Scope } from '../src/adapters/types.ts';
import { makeAdapterCtx, type FixtureSeen, type FixtureReply } from './helpers.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

// Default fixture auth: a pasted github-token; pass {settings:{}} for none.
const makeCtx = (
  handler: (req: { method: string; url: string; headers: Record<string, string>; bodyText: string }, call: number) => FixtureReply,
  opts?: { settings?: Record<string, string | null>; cli?: string | null; store?: string },
): { ctx: Ctx; seen: FixtureSeen } =>
  makeAdapterCtx(handler, opts ?? { settings: { 'github-token': 'GH' } as Record<string, string | null> });

const scope: Scope = { repos: ['github:owner/repo'], assignee: null };
const issue = (over: Record<string, unknown> = {}): unknown => ({
  number: 1, title: 'Fix the bug', state: 'open',
  html_url: 'https://github.com/owner/repo/issues/1',
  body: 'steps', labels: [{ name: 'bug' }], assignee: { login: 'me' },
  updated_at: '2026-01-02T03:04:05Z', ...over,
});

test('list maps issues to RemoteTask, PRs excluded, projectRef set', async () => {
  const { ctx } = makeCtx(({ url }) => {
    if (url.includes('/issues?')) return { status: 200, body: [
      issue(),
      issue({ number: 2, state: 'closed' }),
      { number: 9, title: 'A PR', pull_request: { url: 'x' }, state: 'open' },
      issue({ number: 3, labels: [{ name: 'bad' }, 'plain'] }),
    ] };
    return { status: 404 };
  });
  const tasks = await githubAdapter.list(ctx, scope);
  eq(tasks.length, 3);
  eq(tasks[0]?.externalId, 'owner/repo#1');
  eq(tasks[0]?.projectRef, 'github:owner/repo');
  eq(tasks[0]?.url, 'https://github.com/owner/repo/issues/1');
  eq(tasks[0]?.listId, 'open');
  eq(tasks[0]?.status, 'todo');
  eq(tasks[1]?.listId, 'done');
  deep(tasks[2]?.labels, ['bad', 'plain']);
});

test('assigned-to-me resolves the login and filters by assignee', async () => {
  const { ctx, seen } = makeCtx(({ url }) => {
    if (url.endsWith('/user')) return { status: 200, body: { login: 'me' } };
    return { status: 200, body: [] };
  });
  await githubAdapter.list(ctx, { repos: ['github:owner/repo'], assignee: 'me' });
  ok(seen[0]?.url.endsWith('/user'));
  ok(seen[1]?.url.includes('assignee=me'));
});

test('missing token → AdapterError not retryable, no fetch attempted', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: [] }), { settings: {}, cli: null });
  await assert.rejects(
    () => githubAdapter.list(ctx, scope),
    (e: unknown) => e instanceof AdapterError && !e.retryable && seen.length === 0,
  );
});

test('missing credentials are flagged so the UI can toast-once instead of a banner (review UX)', async () => {
  const { ctx } = makeCtx(() => ({ status: 200, body: [] }), { settings: {}, cli: null });
  await assert.rejects(
    () => githubAdapter.list(ctx, scope),
    (e: unknown) => e instanceof AdapterError && (e as { credentials?: boolean }).credentials === true,
  );
});

test('get maps issue, 404 → null', async () => {
  const { ctx } = makeCtx(({ url }) => {
    if (url.endsWith('/issues/7')) return { status: 200, body: issue({ number: 7, state: 'closed' }) };
    return { status: 404 };
  });
  const got = await githubAdapter.get(ctx, 'owner/repo#7');
  eq(got?.externalId, 'owner/repo#7');
  eq(got?.listId, 'done');
  eq(await githubAdapter.get(ctx, 'owner/repo#404'), null);
});

test('create posts title/body and returns the composite id its own get() accepts (review #2)', async () => {
  const { ctx, seen } = makeCtx(({ method, url }) => {
    if (method === 'POST') return { status: 201, body: { number: 5, html_url: 'u' } };
    if (url.endsWith('/issues/5')) return { status: 200, body: issue({ number: 5 }) };
    return { status: 404 };
  });
  const id = await githubAdapter.create(ctx, { projectRef: 'github:owner/repo', title: 'New', description: 'Body' });
  eq(id, 'owner/repo#5');
  eq(seen[0]?.method, 'POST');
  deep(JSON.parse(seen[0]?.bodyText ?? '{}'), { title: 'New', body: 'Body' });
  // Round-trip: the create output is readable by this adapter's get().
  const got = await githubAdapter.get(ctx, id);
  eq(got?.externalId, 'owner/repo#5');
});

test('update: title/description map to title/body', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: {} }));
  await githubAdapter.update(ctx, 'owner/repo#7', { title: 'T2', description: 'D2', fromListId: 'open' });
  eq(seen[0]?.method, 'PATCH');
  ok(seen[0]?.url.endsWith('/issues/7'));
  deep(JSON.parse(seen[0]?.bodyText ?? '{}'), { title: 'T2', body: 'D2' });
});

test('update: listId move is close/reopen only, labels never touched', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: {} }));
  await githubAdapter.update(ctx, 'owner/repo#7', { listId: 'done', fromListId: 'open' });
  deep(JSON.parse(seen[0]?.bodyText ?? '{}'), { state: 'closed' });
  await githubAdapter.update(ctx, 'owner/repo#7', { listId: 'open', fromListId: 'done' });
  deep(JSON.parse(seen[1]?.bodyText ?? '{}'), { state: 'open' });
  await githubAdapter.update(ctx, 'owner/repo#7', { listId: 'open', fromListId: 'open' });
  eq(seen.length, 2);
});

test('update: explicit labels replace the label set', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: {} }));
  await githubAdapter.update(ctx, 'owner/repo#7', { labels: ['a', 'b'], fromListId: 'open' });
  deep(JSON.parse(seen[0]?.bodyText ?? '{}'), { labels: ['a', 'b'] });
});

test('401 → not retryable; 429/500 → retryable', async () => {
  const statuses = [401, 429, 500];
  let call = 0;
  const { ctx } = makeCtx(() => ({ status: statuses[call++] ?? 200, body: {} }));
  const run = (): Promise<AdapterError> =>
    githubAdapter.list(ctx, scope).then(
      () => { throw new Error('expected AdapterError'); },
      (e) => (e instanceof AdapterError ? e : (() => { throw e; })()),
    );
  eq((await run()).retryable, false);
  eq((await run()).retryable, true);
  eq((await run()).retryable, true);
});

test('non-github repo keys are skipped without a fetch (review #4)', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: [issue()] }));
  const tasks = await githubAdapter.list(ctx, { repos: ['gitlab:group/proj', 'trello:board1', 'github:owner/repo'], assignee: null });
  // Only the github: key produced a request; others are not GitHub repos.
  eq(tasks.length, 1);
  eq(seen.filter((r) => r.url.includes('/issues?')).length, 1);
});

test('bad payload entries are skipped, never thrown', async () => {
  const { ctx } = makeCtx(() => ({
    status: 200,
    body: [issue(), { garbage: true }, 'string', null, issue({ number: 4, title: 42 })],
  }));
  const tasks = await githubAdapter.list(ctx, scope);
  eq(tasks.length, 1);
  eq(tasks[0]?.externalId, 'owner/repo#1');
});

test('mapIssue maps author/milestone/due/comments/checklist/closed', async () => {
  const { ctx } = makeCtx(({ url }) => url.includes('/issues?')
    ? { status: 200, body: [issue({ user: { login: 'bob' }, milestone: { title: 'M1', due_on: '2026-03-01T00:00:00Z' }, comments: 4, body: '- [x] a\n- [ ] b', state: 'closed' })] }
    : { status: 404 });
  const [t] = await githubAdapter.list(ctx, scope);
  eq(t?.author, 'bob');
  eq(t?.milestone, 'M1');
  eq(t?.dueDate, '2026-03-01T00:00:00Z');
  eq(t?.comments, 4);
  deep(t?.checklist, { done: 1, total: 2 });
  eq(t?.closed, true);
});

test('create sends labels when given', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 201, body: { number: 5 } }));
  await githubAdapter.create(ctx, { projectRef: 'github:owner/repo', title: 'N', description: '', labels: ['bug'] });
  deep(JSON.parse(seen[0]?.bodyText ?? '{}'), { title: 'N', body: '', labels: ['bug'] });
});

test('create rejects another provider project without a fetch', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 201, body: { number: 5 } }));
  await assert.rejects(
    () => githubAdapter.create(ctx, { projectRef: 'gitlab:group/project', title: 'N', description: '' }),
    (e: unknown) => e instanceof AdapterError && !e.retryable,
  );
  eq(seen.length, 0);
});

test('update addLabels/removeLabels reads current labels then replaces', async () => {
  const { ctx, seen } = makeCtx(({ method }) => method === 'GET'
    ? { status: 200, body: issue({ number: 7, labels: [{ name: 'a' }, { name: 'b' }] }) }
    : { status: 200, body: {} });
  await githubAdapter.update(ctx, 'owner/repo#7', { addLabels: ['c'], removeLabels: ['a'], fromListId: 'open' });
  const patch = seen.find((s) => s.method === 'PATCH');
  deep(JSON.parse(patch?.bodyText ?? '{}').labels.sort(), ['b', 'c']);
});

test('capabilities: delete unsupported with note, milestone+assignee editable, dueDate not', () => {
  eq(githubAdapter.capabilities.delete, false);
  eq(githubAdapter.capabilities.deleteNote?.includes('Close'), true);
  eq(githubAdapter.capabilities.fields.assignee, true);
  eq(githubAdapter.capabilities.fields.milestone, true);
  eq(githubAdapter.capabilities.fields.dueDate, false);
});

test('options lists assignees, open milestones and label names', async () => {
  const { ctx } = makeCtx(({ url }) => {
    if (url.includes('/assignees')) return { status: 200, body: [{ login: 'octo' }, { login: 'hub' }] };
    if (url.includes('/milestones')) return { status: 200, body: [{ number: 3, title: 'v1.1' }] };
    if (url.includes('/labels')) return { status: 200, body: [{ name: 'bug' }, { name: 'ui' }] };
    return { status: 404 };
  });
  const opts = await githubAdapter.options(ctx, 'github:owner/repo');
  deep(opts.people, [{ id: 'octo', name: 'octo' }, { id: 'hub', name: 'hub' }]);
  deep(opts.milestones, [{ id: '3', name: 'v1.1' }]);
  deep(opts.labels, ['bug', 'ui']);
});

test('update writes assignees (clear with []) and milestone (null clears)', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: issue() }));
  await githubAdapter.update(ctx, 'owner/repo#7', { assigneeId: 'octo', milestoneId: '3' });
  const body = JSON.parse(seen[0]!.bodyText);
  deep(body.assignees, ['octo']);
  eq(body.milestone, 3);
  await githubAdapter.update(ctx, 'owner/repo#7', { assigneeId: null, milestoneId: null });
  const cleared = JSON.parse(seen[1]!.bodyText);
  deep(cleared.assignees, []);
  eq(cleared.milestone, null);
});

test('non-numeric milestone id fails loudly instead of clearing the milestone', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: issue() }));
  await assert.rejects(
    () => githubAdapter.update(ctx, 'owner/repo#7', { milestoneId: 'v1.0' }),
    (e: unknown) => e instanceof AdapterError && !e.retryable,
  );
  eq(seen.length, 0);
});
