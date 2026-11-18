import test from 'node:test';
import assert from 'node:assert/strict';
import { checklistProgress } from '../src/domain/checklist.ts';

test('counts done and total items', () => {
  assert.deepEqual(checklistProgress('- [x] a\n- [ ] b\n* [X] c\n1. [ ] d'), { done: 2, total: 4 });
});
test('null without items or empty', () => {
  assert.equal(checklistProgress(''), null);
  assert.equal(checklistProgress('plain text [ ] not item'), null);
});
test('ignores fenced code', () => {
  assert.equal(checklistProgress('```\n- [ ] x\n```'), null);
  assert.deepEqual(checklistProgress('```\n- [ ] x\n```\n- [x] y'), { done: 1, total: 1 });
});
