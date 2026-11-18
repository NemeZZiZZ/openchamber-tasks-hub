import test from 'node:test';
import assert from 'node:assert/strict';
import { detailCanSave } from '../src/ui/detailState.ts';

test('detail save requires a real change', () => {
  assert.equal(detailCanSave('Title', false), false);
  assert.equal(detailCanSave('Title', true), true);
});

test('detail save rejects an empty title even when another field changed', () => {
  assert.equal(detailCanSave('', true), false);
  assert.equal(detailCanSave('   \n', true), false);
  assert.equal(detailCanSave('  Title  ', true), true);
});
