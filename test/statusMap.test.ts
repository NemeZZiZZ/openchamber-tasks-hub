// test/statusMap.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { toListId, toWritePatch, statusForListId } from '../src/domain/statusMap.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;

test('github state maps to open/done listId', () => {
  eq(toListId('github', { state: 'open' }), 'open');
  eq(toListId('github', { state: 'closed' }), 'done');
  eq(toListId('github', {}), 'open');
});

test('gitlab state+labels map to board lists', () => {
  eq(toListId('gitlab', { state: 'closed' }), 'done');
  eq(toListId('gitlab', { state: 'opened', labels: ['in progress'] }), 'in progress');
  eq(toListId('gitlab', { state: 'opened', labels: ['review'] }), 'review');
  eq(toListId('gitlab', { state: 'opened', labels: ['backend', 'planning'] }), 'open');
  eq(toListId('gitlab', { state: 'opened', labels: ['done', 'backend'] }), 'open');
  eq(toListId('gitlab', {}), 'open');
});

test('unknown payload never throws, defaults to open', () => {
  eq(toListId('gitlab', null as never), 'open');
  eq(toListId('gitlab', { labels: 'x', state: 5 }), 'open');
  eq(toListId('github', null as never), 'open');
});

test('done preserves non-mapping labels (plan excerpt)', () => {
  const p = toWritePatch('gitlab', 'open', 'done', ['planning', 'backend']);
  deep(p.addLabels, ['done']);
  deep(p.removeLabels, []);
  deep(p.retainedLabels, ['planning', 'backend']);
  eq(p.close, true);
  eq(p.reopen, false);
});

test('out-of-done reopens and removes the done label', () => {
  const p = toWritePatch('gitlab', 'done', 'in progress', ['done', 'backend']);
  deep(p.addLabels, ['in progress']);
  deep(p.removeLabels, ['done']);
  deep(p.retainedLabels, ['backend']);
  eq(p.close, false);
  eq(p.reopen, true);
});

test('gitlab label bookkeeping between non-done lists', () => {
  const p = toWritePatch('gitlab', 'open', 'review', ['backend']);
  deep(p.addLabels, ['review']);
  deep(p.removeLabels, []);
  deep(p.retainedLabels, ['backend']);
  eq(p.close, false);
  eq(p.reopen, false);
  const back = toWritePatch('gitlab', 'review', 'open', ['review', 'backend']);
  deep(back.addLabels, []);
  deep(back.removeLabels, ['review']);
  deep(back.retainedLabels, ['backend']);
});

test('github write patch is close/reopen only, labels untouched', () => {
  const close = toWritePatch('github', 'open', 'done', ['bug', 'p1']);
  eq(close.close, true);
  eq(close.reopen, false);
  deep(close.addLabels, []);
  deep(close.removeLabels, []);
  deep(close.retainedLabels, ['bug', 'p1']);
  const reopen = toWritePatch('github', 'done', 'open', ['bug']);
  eq(reopen.reopen, true);
  eq(reopen.close, false);
});

test('local write patch is a no-op (status change handled by store)', () => {
  const p = toWritePatch('local', 'todo', 'done', ['x']);
  eq(p.close, false);
  eq(p.reopen, false);
  deep(p.addLabels, []);
  deep(p.removeLabels, []);
  deep(p.retainedLabels, ['x']);
});

test('same-list move is a no-op', () => {
  const p = toWritePatch('gitlab', 'review', 'review', ['review']);
  deep(p.addLabels, []);
  deep(p.removeLabels, []);
  eq(p.close, false);
  eq(p.reopen, false);
});

test('statusForListId coarse status per adapter', () => {
  eq(statusForListId('gitlab', 'done'), 'done');
  eq(statusForListId('gitlab', 'in progress'), 'in_progress');
  eq(statusForListId('gitlab', 'review'), 'review');
  eq(statusForListId('gitlab', 'open'), 'todo');
  eq(statusForListId('github', 'done'), 'done');
  eq(statusForListId('github', 'open'), 'todo');
  eq(statusForListId('local', 'backlog'), 'backlog');
  eq(statusForListId('local', 'bogus'), 'todo');
});
