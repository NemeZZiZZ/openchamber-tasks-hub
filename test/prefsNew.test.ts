import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, parsePrefs } from '../src/store/prefs.ts';
import { applyPatch, createLocalTask } from '../src/domain/task.ts';
import { dueInfo } from '../src/ui/present.ts';

test('parsePrefs keeps new fields and rejects bad enum values', () => {
  const p = parsePrefs({ groupBy: 'label', labelLists: ['a', 'a', 'b'], assignee: 'me', state: 'open', hideEmpty: true, hideClosed: true });
  assert.equal(p.groupBy, 'label');
  assert.deepEqual(p.labelLists, ['a', 'b']);
  assert.equal(p.assignee, 'me');
  assert.equal(p.state, 'open');
  assert.equal(p.hideEmpty, true);
  assert.equal(p.hideClosed, true);
  assert.equal(p.mineOnly, true);
  const bad = parsePrefs({ groupBy: 'nope', state: 'weird', labelLists: 5, mineOnly: false });
  assert.equal(bad.mineOnly, false);
  assert.equal(bad.groupBy, DEFAULT_PREFS.groupBy);
  assert.equal(bad.state, DEFAULT_PREFS.state);
  assert.deepEqual(bad.labelLists, []);
});

test('applyPatch merges addLabels/removeLabels', () => {
  const task = { ...createLocalTask({ id: 'a', title: 't', now: 1 }), labels: ['x', 'y'] };
  const next = applyPatch(task, { addLabels: ['z'], removeLabels: ['x'] }, 2);
  assert.deepEqual(next.labels.sort(), ['y', 'z']);
});

test('dueInfo flags overdue only when open', () => {
  const now = Date.parse('2026-06-10T12:00:00');
  assert.equal(dueInfo('2026-06-01', false, now)?.overdue, true);
  assert.equal(dueInfo('2026-06-01', true, now)?.overdue, false);
  assert.equal(dueInfo('2026-06-30', false, now)?.overdue, false);
  assert.equal(dueInfo(null, false, now), null);
  assert.equal(dueInfo('garbage', false, now), null);
});
