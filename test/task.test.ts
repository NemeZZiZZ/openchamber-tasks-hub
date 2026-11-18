// test/task.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTask, validateTask, applyPatch, type TaskPatch } from '../src/domain/task.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;

test('createLocalTask shape', () => {
  const t = createLocalTask({ id: 'abc123', title: 'S', description: 'd', now: 1000 });
  eq(t.id, 't_abc123');
  eq(t.adapterId, 'local');
  eq(t.externalId, 'abc123');
  eq(t.url, null);
  eq(t.status, 'todo');
  eq(t.listId, 'todo');
  eq(t.rank, 0);
  eq(t.updatedAt, 1000);
  eq(t.syncState, 'synced');
  eq(t.syncError, null);
  eq(t.sessionId, null);
  eq(t.needsAttentionSince, null);
  deep(t.labels, []);
});

test('createLocalTask clamps bad status to todo', () => {
  eq(createLocalTask({ id: 'x', title: 'T', status: 'bogus' as never }).status, 'todo');
});

test('validateTask accepts a valid UnifiedTask', () => {
  const t = createLocalTask({ id: 'a', title: 'T', now: 5 });
  deep(validateTask(t), t);
});

test('validateTask rejects malformed records (skip-not-fatal)', () => {
  const base = createLocalTask({ id: 'a', title: 'T' });
  eq(validateTask(null), null);
  eq(validateTask('nope'), null);
  eq(validateTask({ id: 't_a', adapterId: 'bogus' }), null);
  eq(validateTask({ ...base, title: 42 }), null);
  eq(validateTask({ ...base, labels: 'x' }), null);
  eq(validateTask({ ...base, status: 'bogus' }), null);
  eq(validateTask({ ...base, syncState: 'bogus' }), null);
  eq(validateTask({ ...base, listId: '' }), null);
  eq(validateTask({ ...base, updatedAt: 'x' }), null);
});

test('every registered AdapterId validates — one source of truth (review #7)', () => {
  const base = createLocalTask({ id: 'a', title: 'T' });
  for (const adapterId of ['local', 'github', 'gitlab', 'trello', 'linear', 'jira']) {
    deep(validateTask({ ...base, adapterId })?.adapterId, adapterId);
  }
});

test('applyPatch applies only known fields, no mutation, optional now', () => {
  const t = createLocalTask({ id: 'a', title: 'Old', description: 'D', now: 1 });
  const p = applyPatch(t, { title: 'New', labels: ['x', 7 as unknown as string], listId: 'review' });
  eq(p.title, 'New');
  deep(p.labels, ['x']);
  eq(p.listId, 'review');
  eq(t.title, 'Old');
  eq(t.labels.length, 0);
  eq(p.updatedAt, 1);
  eq(applyPatch(t, { title: 'N2' }, 99).updatedAt, 99);
});

test('applyPatch ignores unknown patch fields', () => {
  const t = createLocalTask({ id: 'a', title: 'Old' });
  eq(applyPatch(t, { bogus: 1 } as never).title, 'Old');
});

test('applyPatch edits assignee/milestone/dueDate; null clears', () => {
  const base = createLocalTask({ id: 'a', title: 'T' });
  const set = applyPatch(base, { assignee: 'me', milestone: 'M1', dueDate: '2026-12-01' });
  eq(set.assignee, 'me');
  eq(set.milestone, 'M1');
  eq(set.dueDate, '2026-12-01');
  const clear = applyPatch(set, { assignee: null, milestone: null, dueDate: null });
  eq(clear.assignee, null);
  eq(clear.milestone, null);
  eq(clear.dueDate, null);
});

test('applyPatch ignores non-string field edits and never writes native ids to display fields', () => {
  const base = createLocalTask({ id: 'a', title: 'T' });
  const patch = {
    assignee: 42, milestone: {}, dueDate: 'not-a-date',
    assigneeId: 'native-id', milestoneId: 'native-id',
  } as unknown as TaskPatch;
  const p = applyPatch(base, patch);
  eq(p.assignee, base.assignee);
  eq(p.milestone, base.milestone);
  eq(p.dueDate, 'not-a-date'); // any string applies — ISO format is sanitizePatch's job
  eq('assigneeId' in patch, true); // rides through untouched; adapters consume it
  eq('assigneeId' in p, false); // native ids never land on the task row
});
