import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCache, parseCache } from '../src/store/listCache.ts';
import { createLocalTask } from '../src/domain/task.ts';

const task = (i: number, description = 'x'.repeat(500)) => createLocalTask({ id: String(i), title: `T${i}`, description, now: i });

test('buildCache strips descriptions and keeps health/adapters', () => {
  const cache = buildCache({ tasks: [task(1)], health: [{ id: 'github', label: 'GitHub', ok: true, message: null }], adapters: [{ id: 'local' }] }, 42);
  assert.equal(cache.tasks[0]!.description, '');
  assert.equal(cache.savedAt, 42);
  assert.equal(cache.adapters?.length, 1);
});

test('adapter capabilities and configured projects survive the cache round-trip', () => {
  const cache = buildCache({ tasks: [], health: [], adapters: [{
    id: 'github', configured: true, projects: ['github:owner/repo'],
    capabilities: { create: true, delete: false, fields: { assignee: true, milestone: true, dueDate: false, labels: true } },
  }] }, 1);
  const parsed = parseCache(JSON.parse(JSON.stringify(cache)));
  assert.deepEqual(parsed?.adapters?.[0]?.projects, ['github:owner/repo']);
  assert.equal(parsed?.adapters?.[0]?.capabilities?.create, true);
  assert.equal(parsed?.adapters?.[0]?.capabilities?.fields.milestone, true);
});

test('buildCache trims to the storage cap', () => {
  const many = Array.from({ length: 2000 }, (_, i) => task(i));
  const cache = buildCache({ tasks: many, health: [], adapters: null }, 1);
  assert.ok(JSON.stringify(cache).length <= 56_000);
  assert.ok(cache.tasks.length > 0);
});

test('parseCache survives garbage and drops malformed tasks', () => {
  assert.equal(parseCache(null), null);
  assert.equal(parseCache('nope'), null);
  assert.equal(parseCache({ tasks: 3 }), null);
  const parsed = parseCache({ tasks: [task(1), { id: 'bad' }], health: [{ nope: 1 }], adapters: 'x', savedAt: 'y' });
  assert.equal(parsed?.tasks.length, 1);
  assert.deepEqual(parsed?.health, []);
  assert.equal(parsed?.adapters, null);
  assert.equal(parsed?.savedAt, 0);
});
