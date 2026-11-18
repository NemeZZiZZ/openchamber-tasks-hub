import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boardGroupsBy, columnTitle, filterOptions, labelMovePatch, matchesShellFilter,
  CLOSED_COLUMN, OPEN_COLUMN, NONE, NO_ASSIGNEE, NO_MILESTONE, groupingWritable,
} from '../src/ui/shellState.ts';
import type { UnifiedTask } from '../src/domain/task.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;

let seq = 0;
const t = (over: Partial<UnifiedTask>): UnifiedTask => ({
  id: `t${++seq}`, adapterId: 'github', externalId: `e${seq}`, url: null, title: 'T', description: '',
  status: 'todo', listId: 'open', rank: 0, projectRef: null, assignee: null, labels: [], updatedAt: seq,
  syncState: 'synced', syncError: null, sessionId: null, needsAttentionSince: null, ...over,
});
const F = { adapter: 'all', project: 'all', query: '' };
const O = { groupBy: 'label' as const, labelLists: ['bug'], columnOrder: [], hideEmpty: false, hideClosed: false };

test('filters by assignee, none, author, label, state', () => {
  const a = t({ assignee: 'ann', author: 'bob', labels: ['bug'] });
  const b = t({ closed: true, listId: 'done' });
  eq(matchesShellFilter(a, { ...F, assignee: 'ann' }), true);
  eq(matchesShellFilter(a, { ...F, assignee: NONE }), false);
  eq(matchesShellFilter(b, { ...F, assignee: NONE }), true);
  eq(matchesShellFilter(a, { ...F, author: 'bob' }), true);
  eq(matchesShellFilter(a, { ...F, author: 'x' }), false);
  eq(matchesShellFilter(a, { ...F, label: 'bug' }), true);
  eq(matchesShellFilter(a, { ...F, label: 'ui' }), false);
  eq(matchesShellFilter(b, { ...F, state: 'open' }), false);
  eq(matchesShellFilter(b, { ...F, state: 'closed' }), true);
  eq(matchesShellFilter(a, { ...F, assignee: 'all', state: 'all' }), true);
});

test('filterOptions collects distinct sorted values', () => {
  const o = filterOptions([t({ assignee: 'b', labels: ['z', 'a'], author: 'x' }), t({ assignee: 'a', labels: ['a'], milestone: 'M1' })]);
  deep(o.assignees, ['a', 'b']);
  deep(o.labels, ['a', 'z']);
  deep(o.authors, ['x']);
  deep(o.milestones, ['M1']);
});

test('label grouping: Open, label lists, Closed', () => {
  const g = boardGroupsBy([t({ labels: ['bug'] }), t({}), t({ closed: true, listId: 'done', labels: ['bug'] })], F, O);
  deep(g.map((x) => x.listId), [OPEN_COLUMN, 'label:bug', CLOSED_COLUMN]);
  deep(g.map((x) => x.cards.length), [1, 1, 1]);
});

test('hideEmpty and hideClosed drop columns', () => {
  const tasks = [t({}), t({ closed: true, listId: 'done' })];
  const g = boardGroupsBy(tasks, F, { ...O, hideEmpty: true, hideClosed: true });
  deep(g.map((x) => x.listId), [OPEN_COLUMN]);
});

test('assignee and milestone grouping put fallbacks last', () => {
  const tasks = [t({ assignee: 'zed', milestone: 'M2' }), t({}), t({ assignee: 'amy' })];
  deep(boardGroupsBy(tasks, F, { ...O, groupBy: 'assignee' }).map((x) => x.listId), ['amy', 'zed', NO_ASSIGNEE]);
  deep(boardGroupsBy(tasks, F, { ...O, groupBy: 'milestone' }).map((x) => x.listId), ['M2', NO_MILESTONE]);
});

test('groupingWritable only status and label', () => {
  eq(groupingWritable('status'), true);
  eq(groupingWritable('label'), true);
  eq(groupingWritable('assignee'), false);
  eq(groupingWritable('milestone'), false);
});

test('labelMovePatch', () => {
  const open = t({ labels: ['bug', 'x'] });
  deep(labelMovePatch(open, 'label:ui', ['bug', 'ui']), { removeLabels: ['bug'], addLabels: ['ui'] });
  deep(labelMovePatch(open, OPEN_COLUMN, ['bug', 'ui']), { removeLabels: ['bug'] });
  deep(labelMovePatch(open, CLOSED_COLUMN, ['bug']), { listId: 'done', fromListId: 'open' });
  const closed = t({ closed: true, listId: 'done', labels: [] });
  deep(labelMovePatch(closed, 'label:bug', ['bug']), { listId: 'open', fromListId: 'done', addLabels: ['bug'] });
  deep(labelMovePatch(t({ adapterId: 'local', closed: true, listId: 'done' }), OPEN_COLUMN, []), { listId: 'todo', fromListId: 'done' });
  deep(labelMovePatch(closed, CLOSED_COLUMN, []), {});
});

test('columnTitle', () => {
  eq(columnTitle(OPEN_COLUMN, 'label', () => 'x'), 'Open');
  eq(columnTitle('label:bug', 'label', () => 'x'), 'bug');
  eq(columnTitle('amy', 'assignee', () => 'x'), 'amy');
  eq(columnTitle('review', 'status', () => 'Review'), 'Review');
});
