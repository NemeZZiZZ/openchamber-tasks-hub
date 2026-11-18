// test/linkageController.test.ts — unit tests for the extracted linkage
// controller (review #12 / #1: page-level transitions become testable).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkageController, type LinkageHost } from '../src/host/linkage.ts';
import { createLocalTask } from '../src/domain/task.ts';
import type { UnifiedTask } from '../src/domain/task.ts';
import type { SessionsView } from '../src/domain/unlink.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

type SvcCall = { method: string; path: string; body?: unknown };

// In-memory fixture host + service.
const makeFixture = () => {
  const svcCalls: SvcCall[] = [];
  const svc = (async <T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    svcCalls.push({ method, path, body });
    if (path === '/tasks') {
      if (method === 'POST') return { task: { adapterId: 'local', externalId: 'adopted-1' } } as T;
      return { tasks: [] } as T;
    }
    return {} as T;
  }) as never;
  const storageMap = new Map<string, unknown>();
  const storage = {
    keys: async () => [...storageMap.keys()],
    get: async (key: string) => storageMap.get(key),
    set: async (key: string, value: unknown) => { storageMap.set(key, value); },
    delete: async (key: string) => { storageMap.delete(key); },
  };
  const sessionListeners: ((snapshot: SessionsView) => void)[] = [];
  const projectListeners: ((snapshot: { state: string; projects: ReadonlyArray<{ id: string }> }) => void)[] = [];
  const host = {
    onProjects: async (listener: (snapshot: { state: string; projects: ReadonlyArray<{ id: string }> }) => void) => {
      projectListeners.push(listener);
      listener({ state: 'ready', projects: [{ id: 'p1' }] });
      return () => undefined;
    },
    onSessions: async (_projectId: string, listener: (snapshot: SessionsView) => void) => {
      sessionListeners.push(listener);
      return () => undefined;
    },
  } as unknown as LinkageHost;
  return { svcCalls, svc, storage, host, sessionListeners, projectListeners, storageMap };
};

const linkedRemote: UnifiedTask = {
  ...createLocalTask({ id: 'r', title: 'Remote', now: 1 }),
  id: 'tas_github_a#1', adapterId: 'github', externalId: 'a#1', needsAttentionSince: null,
  sessionId: 'ses_1',
};
const linkedLocal: UnifiedTask = {
  ...createLocalTask({ id: 'l', title: 'Local', now: 1 }),
  sessionId: 'ses_2',
};

test('started session produces a /link call (review #1, page-level)', async () => {
  const f = makeFixture();
  const controller = createLinkageController(f.host, f.svc, f.storage, { refresh: () => {}, note: () => {} });
  await controller.linkSession(linkedRemote, 'ses_new');
  deep(f.svcCalls[0], {
    method: 'POST',
    path: '/link',
    body: { adapterId: 'github', externalId: 'a#1', patch: { sessionId: 'ses_new' } },
  });
  controller.dispose();
});

test('session gone: local task DELETE via service; remote clears the link', async () => {
  const f = makeFixture();
  const notes: string[] = [];
  const controller = createLinkageController(f.host, f.svc, f.storage, {
    refresh: () => {},
    note: (message) => notes.push(message),
  });
  controller.sync([linkedLocal, linkedRemote]);
  // Both project snapshots ready, session absent → trusted deletion.
  const ready: SessionsView = { state: 'ready', coverage: [], sessions: [] };
  for (const listener of f.sessionListeners) listener(ready);
  await new Promise((resolve) => setTimeout(resolve, 5));
  ok(f.svcCalls.some((c) => c.method === 'DELETE' && c.path === '/tasks/local/l'));
  ok(f.svcCalls.some((c) => c.method === 'POST' && c.path === '/link'
    && (c.body as { patch: { sessionId: string | null } }).patch.sessionId === null));
  controller.dispose();
});

test('attention: set on waiting, skip unchanged, clear on running', async () => {
  const f = makeFixture();
  const controller = createLinkageController(f.host, f.svc, f.storage, { refresh: () => {}, note: () => {} });
  controller.sync([linkedRemote]);
  const waiting: SessionsView = {
    state: 'ready', coverage: [],
    sessions: [{ id: 'ses_1', directory: '/p', archivedAt: null, activity: 'waiting-question', outcome: null } as never],
  };
  f.sessionListeners[0]?.(waiting);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const first = f.svcCalls.find((c) => c.method === 'POST' && c.path === '/link' && (c.body as { patch: { needsAttentionSince?: unknown } }).patch.needsAttentionSince !== undefined);
  ok(first);
  // Same snapshot again → the badge is already set → no new write.
  const before = f.svcCalls.length;
  f.sessionListeners[0]?.(waiting);
  await new Promise((resolve) => setTimeout(resolve, 5));
  eq(f.svcCalls.length, before);
  // Running → clear (a change → a write).
  const running: SessionsView = {
    state: 'ready', coverage: [],
    sessions: [{ id: 'ses_1', directory: '/p', archivedAt: null, activity: 'running', outcome: null } as never],
  };
  f.sessionListeners[0]?.(running);
  await new Promise((resolve) => setTimeout(resolve, 5));
  ok(f.svcCalls.length > before);
  controller.dispose();
});

test('removed workspace project: its sessions are unknown, never deleted', async () => {
  const f = makeFixture();
  const controller = createLinkageController(f.host, f.svc, f.storage, { refresh: () => {}, note: () => {} });
  controller.sync([linkedLocal]);
  // Listeners: [sync-p1, orphan-p1] initially. ses_2 is alive in p1.
  const alive: SessionsView = {
    state: 'ready', coverage: [],
    sessions: [{ id: 'ses_2', directory: '/p', archivedAt: null, activity: 'running', outcome: null, parentId: null, title: 'T', createdAt: 1 } as never],
  };
  f.sessionListeners[0]?.(alive);
  f.sessionListeners[1]?.(alive);
  await new Promise((resolve) => setTimeout(resolve, 5));
  // The whole project p1 is removed; only p2 is watched and ready, empty.
  for (const listener of f.projectListeners) listener({ state: 'ready', projects: [{ id: 'p2' }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  eq(f.sessionListeners.length, 4);
  const empty: SessionsView = { state: 'ready', coverage: [], sessions: [] };
  f.sessionListeners[2]?.(empty); // sync-p2
  f.sessionListeners[3]?.(empty); // orphan-p2
  await new Promise((resolve) => setTimeout(resolve, 5));
  // No DELETE of the local task and no link-clear: the session is unknown.
  ok(!f.svcCalls.some((c) => c.method === 'DELETE'));
  ok(!f.svcCalls.some((c) => c.method === 'POST' && c.path === '/link'
    && (c.body as { patch?: { sessionId?: unknown } }).patch?.sessionId === null));
  controller.dispose();
});

test('orphan adoption: going-forward only, one adoption per session', async () => {
  const f = makeFixture();
  const controller = createLinkageController(f.host, f.svc, f.storage, { refresh: () => {}, note: () => {} });
  controller.sync([]);
  const before = Date.now();
  const orphan = (id: string, createdAt: number): SessionsView => ({
    state: 'ready', coverage: [],
    sessions: [{ id, parentId: null, archivedAt: null, title: 'Fresh work', createdAt } as never],
  });
  // Pre-existing session (older than the first-run watermark) → skipped.
  // Listeners: [sync-p1, orphan-p1]; orphans arrive on the second one.
  f.sessionListeners[1]?.(orphan('ses_old', 1));
  await new Promise((resolve) => setTimeout(resolve, 10));
  // New session, reported twice (repeated snapshots) → adopted once.
  f.sessionListeners[1]?.(orphan('ses_new', before + 60_000));
  f.sessionListeners[1]?.(orphan('ses_new', before + 60_000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const creates = f.svcCalls.filter((c) => c.method === 'POST' && c.path === '/tasks');
  eq(creates.length, 1);
  // Watermark persisted past the adopted session.
  eq(await f.storageMap.get('orphanWatermark'), before + 60_000);
  controller.dispose();
});
