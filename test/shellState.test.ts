// test/shellState.test.ts — pure view-state, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyColumnOrder, boardGroups, boardGroupsWithExtras, capabilitiesOf, createSources, deleteConfirm, extraBoardLists, matchesShellFilter, otherLists, planDrop, railCounts, tableOrder } from '../src/ui/shellState.ts';
import { createLocalTask } from '../src/domain/task.ts';
import type { UnifiedTask } from '../src/domain/task.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

let seq = 0;
const remote = (over: Partial<UnifiedTask>): UnifiedTask => ({
  id: `tas_github_r${++seq}`,
  adapterId: 'github',
  externalId: `r${seq}`,
  url: null,
  title: 'T',
  description: '',
  status: 'todo',
  listId: 'open',
  rank: 0,
  projectRef: null,
  assignee: null,
  labels: [],
  updatedAt: 0,
  syncState: 'synced',
  syncError: null,
  sessionId: null,
  needsAttentionSince: null,
  ...over,
});

const FILTER = { adapter: 'all', project: 'all', query: '' };

test('table sorts remote by updated desc (plan excerpt)', () => {
  const rows = [remote({ updatedAt: 5, title: 'b' }), remote({ updatedAt: 9, title: 'c' }), remote({ updatedAt: 3, title: 'a' })];
  deep(tableOrder(rows, FILTER).map((t) => t.title), ['c', 'b', 'a']);
});

test('board groups by listId, not fixed five (plan excerpt)', () => {
  const rows = [
    remote({ listId: 'open' }), remote({ listId: 'open' }), remote({ listId: 'done' }),
  ];
  const groups = boardGroups(rows, FILTER);
  deep(groups.map((g) => ({ listId: g.listId, count: g.cards.length })), [
    { listId: 'open', count: 2 },
    { listId: 'done', count: 1 },
  ]);
  deep(Object.keys(groups).length, 2);
});

test('board order: attention leads, then rank, then newest', () => {
  const rows = [
    remote({ listId: 'open', rank: 1, updatedAt: 1 }),
    remote({ listId: 'open', rank: 0.5, updatedAt: 1 }),
    remote({ listId: 'open', rank: 2, updatedAt: 1, needsAttentionSince: 100 }),
    remote({ listId: 'open', rank: 0.4, updatedAt: 9 }),
  ];
  const cards = boardGroups(rows, FILTER)[0]?.cards ?? [];
  deep(cards.map((t) => t.rank), [2, 0.4, 0.5, 1]);
});

test('filter: adapter, project, query', () => {
  const rows = [
    remote({ adapterId: 'gitlab', title: 'Zebra' }),
    remote({ projectRef: 'github:owner/repo' }),
    remote({ title: 'plain' }),
  ];
  eq(matchesShellFilter(rows[0]!, { adapter: 'gitlab', project: 'all', query: '' }), true);
  eq(matchesShellFilter(rows[0]!, { adapter: 'github', project: 'all', query: '' }), false);
  eq(matchesShellFilter(rows[1]!, { adapter: 'all', project: 'github:owner/repo', query: '' }), true);
  eq(matchesShellFilter(rows[1]!, { adapter: 'all', project: '__none__', query: '' }), false);
  eq(matchesShellFilter(rows[2]!, { adapter: 'all', project: 'all', query: 'zeb' }), false);
  eq(matchesShellFilter(rows[0]!, { adapter: 'all', project: 'all', query: 'zeb' }), true);
});

test('otherLists offers every other column', () => {
  const groups = boardGroups([remote({ listId: 'open' }), remote({ listId: 'in progress' })], FILTER);
  deep(otherLists(groups, 'open'), ['in progress']);
});

test('planDrop fractional rank between neighbors, end, and rebalance fallback', () => {
  const col = [
    remote({ rank: 1 }),
    remote({ rank: 2 }),
    remote({ rank: 3 }),
  ];
  eq(planDrop(col, 'x', col[1]!.id), 1.5);
  eq(planDrop(col, 'x', null), 3 + 1024);
  const tight = [remote({ rank: 1 }), remote({ rank: 1 + 5e-7 })];
  eq(planDrop(tight, 'x', null) > tight[1]!.rank, true);
});

test('extraBoardLists: known-empty columns for the visible adapters (kanban drop targets)', () => {
  // local present → the five statuses are always droppable, done included.
  const withLocal = extraBoardLists([{ adapterId: 'local', projectRef: null } as UnifiedTask]);
  deep(withLocal, ['backlog', 'todo', 'in_progress', 'review', 'done']);
  // github present → open/done.
  const withGithub = extraBoardLists([{ adapterId: 'github' } as UnifiedTask]);
  deep(withGithub, ['open', 'done']);
  // gitlab → done (close) only; its other lists are label-driven.
  const withGitlab = extraBoardLists([{ adapterId: 'gitlab' } as UnifiedTask]);
  deep(withGitlab, ['done']);
  // Data lists already present are not duplicated.
  const rows = [
    remote({ listId: 'todo', adapterId: 'local' }),
    remote({ listId: 'open', adapterId: 'github' }),
    remote({ listId: 'done', adapterId: 'gitlab' }),
  ];
  const groups = boardGroupsWithExtras(rows, FILTER);
  deep(groups.map((g) => g.listId), ['todo', 'open', 'done', 'backlog', 'in_progress', 'review']);
});

test('applyColumnOrder: dragged columns lead, unknown lists keep data order (review UX round 2)', () => {
  const groups = [
    { listId: 'open', cards: [] },
    { listId: 'todo', cards: [] },
    { listId: 'in progress', cards: [] },
    { listId: 'done', cards: [] },
  ];
  // User dragged 'done' before 'open': explicit order wins for known ids.
  deep(applyColumnOrder(groups, ['done', 'open']).map((g) => g.listId), ['done', 'open', 'todo', 'in progress']);
  // A listId absent from the order (new GitLab list) follows in data order.
  deep(applyColumnOrder(groups, ['todo']).map((g) => g.listId), ['todo', 'open', 'in progress', 'done']);
  // Empty order = unchanged (first-seen data order).
  deep(applyColumnOrder(groups, []).map((g) => g.listId), ['open', 'todo', 'in progress', 'done']);
});

test('railCounts: open/total + first error per adapter', () => {
  const local = createLocalTask({ id: 'l1', title: 'L', now: 1 });
  const rows = [
    local,
    remote({ syncState: 'error', syncError: 'GitLab API 500' }),
    remote({ syncState: 'error', syncError: 'second ignored' }),
  ];
  const counts = railCounts(rows);
  eq(counts.open, 3);
  eq(counts.total, 3);
  deep(counts.errorsByAdapter, { github: 'GitLab API 500' });
});

test('createSources: configured + create-capable, local always, no hardcoding', () => {
  const adapters = [
    { id: 'local', configured: true, capabilities: { create: true, delete: true, fields: { assignee: false, milestone: false, dueDate: false, labels: true } } },
    { id: 'gitlab', configured: true, capabilities: { create: true, delete: true, fields: { assignee: true, milestone: true, dueDate: true, labels: true } } },
    { id: 'trello', configured: true, capabilities: { create: true, delete: true, fields: { assignee: true, milestone: false, dueDate: true, labels: true } } },
    { id: 'github', configured: false, capabilities: { create: true, delete: false, fields: { assignee: true, milestone: true, dueDate: false, labels: true } } },
  ];
  deep(createSources(adapters).map((a) => a.id), ['local', 'gitlab', 'trello']);
  // Older cached rows without capabilities keep creating (default allow).
  deep(createSources([{ id: 'gitlab', configured: true }]).map((a) => a.id), ['gitlab']);
});

test('deleteConfirm: capability-gated, local wording, no platform hardcode', () => {
  const gl = remote({ id: 'tas_gitlab_g/p#12', adapterId: 'gitlab', externalId: 'g/p#12', title: 'Fix', projectRef: 'gitlab:g/p' });
  const caps = { create: true, delete: true, fields: { assignee: false, milestone: false, dueDate: false, labels: false } };
  const confirm = deleteConfirm(gl, caps);
  eq(confirm?.title, 'Delete issue?');
  ok(confirm?.body.includes('GitLab'));
  ok(confirm?.body.includes('g/p#12'));
  eq(deleteConfirm(gl, undefined), null); // fail closed while metadata loads
  eq(deleteConfirm(gl, { ...caps, delete: false }), null);
  // If GitHub ever declares delete support, no UI branch needs changing.
  eq(deleteConfirm({ ...gl, adapterId: 'github' }, caps)?.title, 'Delete issue?');
  ok(deleteConfirm({ ...gl, adapterId: 'local', externalId: 'x' }, caps)?.body.includes('locally'));
});

test('capabilitiesOf finds the adapter entry; missing list → undefined', () => {
  const caps = { create: true, delete: true, fields: { assignee: true, milestone: true, dueDate: true, labels: true } };
  eq(capabilitiesOf([{ id: 'gitlab', capabilities: caps }], 'gitlab'), caps);
  eq(capabilitiesOf([{ id: 'gitlab', capabilities: caps }], 'github'), undefined);
  eq(capabilitiesOf(null, 'gitlab'), undefined);
});
