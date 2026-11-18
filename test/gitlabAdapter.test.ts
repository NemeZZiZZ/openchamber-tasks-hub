// test/gitlabAdapter.test.ts — fixture HTTP, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gitlabAdapter } from '../src/adapters/gitlab.ts';
import { AdapterError, type Ctx, type Scope } from '../src/adapters/types.ts';
import { makeAdapterCtx, type FixtureSeen, type FixtureReply } from './helpers.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

const makeCtx = (
  handler: (req: { method: string; url: string; headers: Record<string, string>; bodyText: string }, call: number) => FixtureReply,
  opts?: { settings?: Record<string, string | null>; cli?: string | null; store?: string },
): { ctx: Ctx; seen: FixtureSeen } => makeAdapterCtx(handler, opts);

const issue = (over: Record<string, unknown> = {}): unknown => ({
  iid: 12, title: 'Design the board', state: 'opened', issue_type: 'issue',
  web_url: 'https://gitlab.com/group/proj/-/issues/12',
  description: 'notes', labels: ['backend'], assignee: { username: 'me' },
  updated_at: '2026-01-02T03:04:05Z', ...over,
});
const scope: Scope = { repos: ['gitlab:group/proj'], assignee: null };
const tokenOpts = { store: JSON.stringify({ providers: { gitlab: { instances: {
  'https://gitlab.com': { credentials: [{ credentialId: 'c1', status: 'valid', token: 'GL' }] },
} } } }) };

test('list maps issues + work items, labels → listId, projectRef set', async () => {
  const { ctx, seen } = makeCtx(({ url }) => {
    if (url.includes('/issues?')) return { status: 200, body: [
      issue(),
      issue({ iid: 13, labels: ['in progress'], issue_type: 'incident', web_url: 'https://gitlab.com/group/proj/-/issues/13' }),
      issue({ iid: 14, state: 'closed' }),
    ] };
    return { status: 404 };
  }, tokenOpts);
  const tasks = await gitlabAdapter.list(ctx, scope);
  eq(tasks.length, 3);
  eq(tasks[0]?.externalId, 'group/proj#12');
  eq(tasks[0]?.listId, 'open');
  eq(tasks[1]?.listId, 'in progress');
  eq(tasks[1]?.issueType, 'incident');
  eq(tasks[2]?.listId, 'done');
  eq(tasks[0]?.projectRef, 'gitlab:group/proj');
  ok(seen[0]?.headers['PRIVATE-TOKEN'] === 'GL');
  ok(seen[0]?.url.startsWith('https://gitlab.com/api/v4/'));
});

test('assigned-to-me uses scope=assigned-to-me', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: [] }), tokenOpts);
  await gitlabAdapter.list(ctx, { repos: ['gitlab:group/proj'], assignee: 'me' });
  ok(seen[0]?.url.includes('scope=assigned-to-me'));
});

test('self-hosted repo key resolves serverSetting token for that host', async () => {
  const settings = { 'gitlab-server': 'https://gitlab.example.com', 'gitlab-token': 'SELF' };
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: [] }), { settings });
  await gitlabAdapter.list(ctx, { repos: ['gitlab:gitlab.example.com/group/proj'], assignee: null });
  ok(seen[0]?.url.startsWith('https://gitlab.example.com/api/v4/'));
  ok(seen[0]?.headers['PRIVATE-TOKEN'] === 'SELF');
});

test('missing token → not retryable, no fetch', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: [] }));
  await assert.rejects(
    () => gitlabAdapter.list(ctx, scope),
    (e: unknown) => e instanceof AdapterError && !e.retryable && seen.length === 0,
  );
});

test('gitlab move open->done closes and keeps backend label (plan excerpt)', async () => {
  const { ctx, seen } = makeCtx(({ method }) => (method === 'PUT' ? { status: 200, body: {} } : { status: 404 }), tokenOpts);
  await gitlabAdapter.update(ctx, 'group/proj#12', { listId: 'done', fromListId: 'open' });
  eq(seen[0]?.method, 'PUT');
  const body = JSON.parse(seen[0]?.bodyText ?? '{}') as Record<string, unknown>;
  eq(body.state_event, 'close');
  ok(String(body.add_labels).includes('done'));
});

test('move done->in progress reopens, removes done, adds in progress', async () => {
  const { ctx, seen } = makeCtx(({ method }) => (method === 'PUT' ? { status: 200, body: {} } : { status: 404 }), tokenOpts);
  await gitlabAdapter.update(ctx, 'group/proj#12', { listId: 'in progress', fromListId: 'done' });
  const body = JSON.parse(seen[0]?.bodyText ?? '{}') as Record<string, unknown>;
  eq(body.state_event, 'reopen');
  ok(String(body.remove_labels).includes('done'));
  ok(String(body.add_labels).includes('in progress'));
});

test('update title/description; explicit labels replace; create returns the composite id its own get() accepts (review #2)', async () => {
  const { ctx, seen } = makeCtx(({ url, method }) => {
    if (method === 'POST' && url.endsWith('/issues')) return { status: 201, body: { iid: 33 } };
    if (url.endsWith('/issues/33')) return { status: 200, body: issue({ iid: 33 }) };
    return { status: 200, body: {} };
  }, tokenOpts);
  await gitlabAdapter.update(ctx, 'group/proj#12', { title: 'T2', description: 'D2', fromListId: 'open' });
  const body = JSON.parse(seen[0]?.bodyText ?? '{}') as Record<string, unknown>;
  eq(body.title, 'T2');
  eq(body.description, 'D2');
  await gitlabAdapter.update(ctx, 'group/proj#12', { labels: ['a'], fromListId: 'open' });
  ok('labels' in (JSON.parse(seen[1]?.bodyText ?? '{}') as Record<string, unknown>));
  const id = await gitlabAdapter.create(ctx, { projectRef: 'gitlab:group/proj', title: 'New', description: 'D' });
  eq(id, 'group/proj#33');
  // Round-trip.
  const got = await gitlabAdapter.get(ctx, id);
  eq(got?.externalId, 'group/proj#33');
  ok(seen[2]?.url.includes('/projects/group%2Fproj/issues'));
});

test('401 → not retryable; 500/429 → retryable; bad payload skipped', async () => {
  const statuses = [401, 500, 429];
  let call = 0;
  const { ctx } = makeCtx(() => ({ status: statuses[call++] ?? 200, body: {} }), tokenOpts);
  const run = (): Promise<AdapterError> =>
    gitlabAdapter.list(ctx, scope).then(
      () => { throw new Error('expected AdapterError'); },
      (e) => (e instanceof AdapterError ? e : (() => { throw e; })()),
    );
  eq((await run()).retryable, false);
  eq((await run()).retryable, true);
  eq((await run()).retryable, true);
  const { ctx: ctx2 } = makeCtx(() => ({ status: 200, body: [issue(), { garbage: 1 }, issue({ iid: 0 })] }), tokenOpts);
  eq((await gitlabAdapter.list(ctx2, scope)).length, 1);
});

test('mapIssue maps author/milestone/own due/comments/checklist', async () => {
  const { ctx } = makeCtx(({ url }) => url.includes('/issues?')
    ? { status: 200, body: [issue({ author: { username: 'bob' }, due_date: '2026-02-15', milestone: { title: 'M1', due_date: '2026-03-01' }, user_notes_count: 3, task_completion_status: { count: 4, completed_count: 1 } })] }
    : { status: 404 }, tokenOpts);
  const [t] = await gitlabAdapter.list(ctx, scope);
  eq(t?.author, 'bob');
  eq(t?.milestone, 'M1');
  eq(t?.dueDate, '2026-02-15');
  eq(t?.comments, 3);
  deep(t?.checklist, { done: 1, total: 4 });
  eq(t?.closed, false);

  const { ctx: clearedCtx } = makeCtx(({ url }) => url.includes('/issues?')
    ? { status: 200, body: [issue({ due_date: null, milestone: { title: 'M1', due_date: '2026-03-01' } })] }
    : { status: 404 }, tokenOpts);
  const [cleared] = await gitlabAdapter.list(clearedCtx, scope);
  eq(cleared?.dueDate, null); // clearing is not masked by the milestone date
});

test('create sends labels; update merges addLabels/removeLabels', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: { iid: 9 } }), tokenOpts);
  await gitlabAdapter.create(ctx, { projectRef: 'gitlab:group/proj', title: 'N', description: '', labels: ['a', 'b'] });
  eq((JSON.parse(seen[0]?.bodyText ?? '{}') as Record<string, unknown>).labels, 'a,b');
  await gitlabAdapter.update(ctx, 'group/proj#12', { addLabels: ['x'], removeLabels: ['y'], fromListId: 'open' });
  const body = JSON.parse(seen[1]?.bodyText ?? '{}') as Record<string, unknown>;
  eq(body.add_labels, 'x');
  eq(body.remove_labels, 'y');
});

test('self-hosted ids carry the host: list/get/update/create round-trip', async () => {
  const settings = { 'gitlab-server': 'https://gitlab.example.com', 'gitlab-token': 'SELF' };
  const { ctx, seen } = makeCtx(({ url, method }) => {
    if (method === 'POST' && url.endsWith('/issues')) return { status: 201, body: { iid: 7 } };
    if (url.includes('/issues?')) return { status: 200, body: [issue({ iid: 5 })] };
    if (url.endsWith('/issues/7')) return { status: 200, body: issue({ iid: 7 }) };
    if (url.endsWith('/issues/5')) return { status: 200, body: issue({ iid: 5 }) };
    return { status: 200, body: {} };
  }, { settings });
  const repos = ['gitlab:gitlab.example.com/group/proj'];
  const [t] = await gitlabAdapter.list(ctx, { repos, assignee: null });
  // The host rides in the id so get/update resolve off the public host.
  eq(t?.externalId, 'gitlab.example.com/group/proj#5');
  eq(t?.projectRef, 'gitlab:gitlab.example.com/group/proj');
  await gitlabAdapter.update(ctx, 'gitlab.example.com/group/proj#5', { listId: 'done', fromListId: 'open' });
  const put = seen.find((s) => s.method === 'PUT');
  ok(put?.url.startsWith('https://gitlab.example.com/api/v4/'));
  ok(put?.url.includes('/issues/5'));
  const id = await gitlabAdapter.create(ctx, { projectRef: 'gitlab:gitlab.example.com/group/proj', title: 'N', description: '' });
  eq(id, 'gitlab.example.com/group/proj#7');
  const got = await gitlabAdapter.get(ctx, id);
  eq(got?.externalId, 'gitlab.example.com/group/proj#7');
  // A non-numeric iid is refused before any request is built.
  await assert.rejects(() => gitlabAdapter.get(ctx, 'gitlab.example.com/group/proj#1/../../user'));
});

test('capabilities: everything editable, delete supported', () => {
  eq(gitlabAdapter.capabilities.delete, true);
  eq(gitlabAdapter.capabilities.fields.dueDate, true);
  eq(gitlabAdapter.capabilities.fields.milestone, true);
});

test('options lists members, active milestones and label names', async () => {
  const { ctx } = makeCtx(({ url }) => {
    if (url.includes('/members/all')) return { status: 200, body: [{ id: 11, username: 'ada', name: 'Ada L.' }] };
    if (url.includes('/milestones')) return { status: 200, body: [{ id: 22, title: 'Sprint 9' }] };
    if (url.includes('/labels?')) return { status: 200, body: [{ name: 'bug' }] };
    return { status: 404 };
  }, tokenOpts);
  const opts = await gitlabAdapter.options(ctx, 'gitlab:group/proj');
  // Name = username: list() maps assignee.username, so the select must
  // match it (a full-name select never matches the row).
  deep(opts.people, [{ id: '11', name: 'ada' }]);
  deep(opts.milestones, [{ id: '22', name: 'Sprint 9' }]);
  deep(opts.labels, ['bug']);
});

test('delete hits the issue endpoint; 404 becomes notFound', async () => {
  const okCtx = makeCtx(({ method, url }) => {
    eq(method, 'DELETE');
    ok(url.includes('/issues/'));
    return { status: 204 };
  }, tokenOpts);
  await gitlabAdapter.delete(okCtx.ctx, 'group/proj#5');
  const goneCtx = makeCtx(() => ({ status: 404 }), tokenOpts);
  await assert.rejects(() => gitlabAdapter.delete(goneCtx.ctx, 'group/proj#5'),
    (e: unknown) => e instanceof AdapterError && e.notFound);
});

test('update writes assignee_ids, milestone_id and due_date (null clears)', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: { iid: 5 } }), tokenOpts);
  await gitlabAdapter.update(ctx, 'group/proj#5', { assigneeId: '11', milestoneId: '22', dueDate: '2026-12-01' });
  const body = JSON.parse(seen[0]!.bodyText);
  deep(body.assignee_ids, [11]);
  eq(body.milestone_id, 22);
  eq(body.due_date, '2026-12-01');
  await gitlabAdapter.update(ctx, 'group/proj#5', { assigneeId: null, milestoneId: null, dueDate: null });
  const cleared = JSON.parse(seen[1]!.bodyText);
  deep(cleared.assignee_ids, []);
  eq(cleared.milestone_id, null);
  eq(cleared.due_date, null);
});

test('non-numeric native ids fail loudly instead of serializing NaN as null', async () => {
  const { ctx, seen } = makeCtx(() => ({ status: 200, body: { iid: 5 } }), tokenOpts);
  await assert.rejects(
    () => gitlabAdapter.update(ctx, 'group/proj#5', { milestoneId: 'sprint-9' }),
    (e: unknown) => e instanceof AdapterError && !e.retryable,
  );
  eq(seen.length, 0);
  await assert.rejects(
    () => gitlabAdapter.update(ctx, 'group/proj#5', { assigneeId: 'ada' }),
    (e: unknown) => e instanceof AdapterError && !e.retryable,
  );
  eq(seen.length, 0);
});
