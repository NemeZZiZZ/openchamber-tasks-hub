// test/linkage.test.ts — pure linkage semantics (attention, unlink,
// adoption, start-agent plan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionForSession } from '../src/domain/attention.ts';
import { dispositionForGoneSession, sessionLinkState, worktreeLinkState } from '../src/domain/unlink.ts';
import { isAdoptable, startAgentPlan, titleForOrphanSession } from '../src/domain/autoTask.ts';
import { mapTasksToWatched } from '../src/host/sessionSync.ts';
import type { UnifiedTask } from '../src/domain/task.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

test('agent finish sets badge, not a column move (plan excerpt)', () => {
  // The mapping returns actions, never listIds — by construction.
  eq(attentionForSession({ activity: 'idle', outcome: 'completed' }), 'set');
  eq(attentionForSession({ activity: 'waiting-question', outcome: null }), 'set');
  eq(attentionForSession({ activity: 'waiting-permission', outcome: null }), 'set');
  eq(attentionForSession({ activity: 'running', outcome: null }), 'clear');
  eq(attentionForSession({ activity: 'idle', outcome: null }), 'keep');
  eq(attentionForSession({ activity: 'mystery-state', outcome: null }), 'keep');
});

test('unknown snapshot never deletes (link state semantics)', () => {
  const loading = { state: 'loading' as const, coverage: [], sessions: [] };
  eq(sessionLinkState('s1', '/p', loading), 'unknown');
  const dirLoading = {
    state: 'ready' as const,
    coverage: [{ directory: '/p', state: 'loading' as const }],
    sessions: [],
  };
  eq(sessionLinkState('s1', '/p', dirLoading), 'unknown');
  eq(sessionLinkState('s1', null, dirLoading), 'unknown');
  // Ready snapshot + ready coverage → absence is trusted.
  const ready = { state: 'ready' as const, coverage: [{ directory: '/p', state: 'ready' as const }], sessions: [] };
  eq(sessionLinkState('s1', '/p', ready), 'deleted');
  const archived = { state: 'ready' as const, coverage: [], sessions: [{ id: 's1', directory: '/p', archivedAt: 5 }] };
  eq(sessionLinkState('s1', '/p', archived), 'archived');
  const linked = { state: 'ready' as const, coverage: [], sessions: [{ id: 's1', directory: '/p', archivedAt: null }] };
  eq(sessionLinkState('s1', '/p', linked), 'linked');
  eq(worktreeLinkState('/w', { state: 'loading', worktrees: [] }), 'unknown');
  eq(worktreeLinkState('/w', { state: 'ready', worktrees: [] }), 'gone');
  eq(worktreeLinkState('/w', { state: 'ready', worktrees: [{ directory: '/w', status: 'missing' as const }] }), 'gone');
  eq(worktreeLinkState('/w', { state: 'ready', worktrees: [{ directory: '/w', status: 'ready' as const }] }), 'linked');
});

test('deleting a linked session: local task deleted, remote link cleared (plan excerpt)', () => {
  eq(dispositionForGoneSession('local'), 'delete-task');
  eq(dispositionForGoneSession('github'), 'clear-link');
  eq(dispositionForGoneSession('gitlab'), 'clear-link');
});

test('adopt guard: top-level, live, unclaimed only', () => {
  const claimed = new Set(['taken']);
  eq(isAdoptable({ id: 'a', parentId: null, archivedAt: null }, claimed), true);
  eq(isAdoptable({ id: 'taken', parentId: null, archivedAt: null }, claimed), false);
  eq(isAdoptable({ id: 'b', parentId: 'parent', archivedAt: null }, claimed), false);
  eq(isAdoptable({ id: 'c', parentId: null, archivedAt: 5 }, claimed), false);
  eq(titleForOrphanSession({ id: 'ses_1234567890', title: 'ses_1234567890' }, 'myproj'), 'New session in myproj');
  eq(titleForOrphanSession({ id: 's', title: 'Real title' }, null), 'Real title');
});

test('start agent: no checkout prompts for a project root (plan excerpt)', () => {
  const projects = [
    { directory: '/work/app', remoteKeys: ['github:owner/app', 'gitlab:group/app'] },
    { directory: '/work/site', remoteKeys: ['gitlab:site/repo'] },
  ];
  deep(startAgentPlan({ adapterId: 'local', projectRef: null }, projects), { mode: 'prompt-root' });
  // Remote task whose repo has a known checkout → direct start.
  deep(startAgentPlan({ adapterId: 'github', projectRef: 'github:owner/app' }, projects), { mode: 'direct', directory: '/work/app' });
  // Remote task without a matching checkout → prompt, never auto-clone.
  deep(startAgentPlan({ adapterId: 'gitlab', projectRef: 'gitlab:other/repo' }, projects), { mode: 'prompt-root' });
  ok('no clone mode exists');
});

test('mapTasksToWatched keeps only linked tasks (review #1)', () => {
  const linked: Partial<UnifiedTask> = { id: 'tas_github_a', adapterId: 'github', sessionId: 'ses_1', needsAttentionSince: null };
  const unlinked: Partial<UnifiedTask> = { id: 'tas_github_b', adapterId: 'github', sessionId: null, needsAttentionSince: 5 };
  const local: Partial<UnifiedTask> = { id: 'tas_local_c', adapterId: 'local', sessionId: 'ses_2', needsAttentionSince: 7 };
  const watched = mapTasksToWatched([linked, unlinked, local] as UnifiedTask[]);
  deep(watched, [
    { id: 'tas_github_a', adapterId: 'github', sessionId: 'ses_1', needsAttentionSince: null },
    { id: 'tas_local_c', adapterId: 'local', sessionId: 'ses_2', needsAttentionSince: 7 },
  ]);
});
