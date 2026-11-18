// Live session watcher behind every task with a linked session (review #1:
// the watcher must actually watch — the panel feeds it via sync() on every
// task-list refresh). Sessions can live in ANY registered project and the
// overlay link does not record which one, so every project is watched and
// a session's disappearance is trusted only when ALL project snapshots are
// ready and none contains it (domain sessionLinkState per project:
// 'unknown' anywhere → never act).
import { attentionForSession, type AttentionAction } from '../domain/attention.ts';
import { sessionLinkState, type SessionsView, type SessionGoneReason } from '../domain/unlink.ts';
import type { UnifiedTask } from '../domain/task.ts';

export type WatchedTask = {
  id: string;
  adapterId: string;
  sessionId: string;
  needsAttentionSince: number | null;
};

// Pure: only tasks that actually point at a session are watched.
export const mapTasksToWatched = (tasks: readonly UnifiedTask[]): WatchedTask[] =>
  tasks
    .filter((t) => typeof t.sessionId === 'string' && t.sessionId.length > 0)
    .map((t) => ({ id: t.id, adapterId: t.adapterId, sessionId: t.sessionId as string, needsAttentionSince: t.needsAttentionSince }));

export type SessionSyncHost = {
  onProjects(listener: (snapshot: { state: string; projects: ReadonlyArray<{ id: string }> }) => void): Promise<() => void>;
  onSessions(projectId: string, listener: (snapshot: SessionsView) => void): Promise<() => void>;
};

export const createSessionSync = (
  host: SessionSyncHost,
  onAttention: (taskId: string, action: AttentionAction, now: number) => void,
  onSessionGone: (taskId: string, sessionId: string, reason: SessionGoneReason) => void,
) => {
  let watched: WatchedTask[] = [];
  const snapshots = new Map<string, SessionsView>();
  // Projects where each session was last seen: a session that disappears
  // together with its whole project (unwatched, not deleted) is unknown,
  // never 'deleted' — otherwise removing a workspace project deletes the
  // linked local tasks (pre-publish review).
  const seenIn = new Map<string, Set<string>>();
  const projectSubs = new Map<string, Promise<() => void>>();
  let disposed = false;
  let stopProjects: (() => void) | null = null;

  // Aggregate per project: found anywhere → linked/archived; every project
  // ready and found nowhere → deleted; any not-ready → unknown (never act).
  const evaluate = (): void => {
    if (disposed) return;
    if (snapshots.size === 0) return;
    const views = [...snapshots.values()];
    const now = Date.now();
    for (const task of watched) {
      let foundState: 'linked' | 'archived' | null = null;
      let allDeleted = true;
      let anyUnknown = false;
      for (const [projectId, view] of snapshots) {
        const state = sessionLinkState(task.sessionId, null, view);
        if (state === 'linked' || state === 'archived') {
          foundState = state;
          let projects = seenIn.get(task.sessionId);
          if (!projects) { projects = new Set(); seenIn.set(task.sessionId, projects); }
          projects.add(projectId);
          break;
        }
        if (state === 'unknown') { anyUnknown = true; allDeleted = false; }
      }
      // A project that used to contain the session is gone from the watch
      // set (removed workspace project): the session is unknown, not gone.
      const seen = seenIn.get(task.sessionId);
      const lostProject = seen ? [...seen].some((id) => !snapshots.has(id)) : false;
      if (foundState) {
        if (foundState === 'archived') onSessionGone(task.id, task.sessionId, 'archived');
        const session = views
          .map((v) => v.sessions.find((s) => s.id === task.sessionId))
          .find((s) => s !== undefined);
        const activity = (session as { activity?: string } | undefined)?.activity ?? 'idle';
        const outcome = (session as { outcome?: 'completed' | 'failed' | null } | undefined)?.outcome ?? null;
        onAttention(task.id, attentionForSession({ activity, outcome }), now);
        continue;
      }
      if (!lostProject && !anyUnknown && allDeleted && views.every((v) => v.state === 'ready')) {
        seenIn.delete(task.sessionId);
        onSessionGone(task.id, task.sessionId, 'deleted');
      }
      // unknown or still-loading: no action this round.
    }
  };

  const applySnapshot = (projectId: string, snapshot: SessionsView): void => {
    if (disposed) return;
    snapshots.set(projectId, snapshot);
    evaluate();
  };

  const watchProject = (projectId: string): void => {
    if (projectSubs.has(projectId)) return;
    const promise = host.onSessions(projectId, (snapshot) => applySnapshot(projectId, snapshot));
    projectSubs.set(projectId, promise);
    void promise.then((stop) => {
      if (disposed || !projectSubs.has(projectId)) stop();
    }, () => undefined);
  };

  void host.onProjects((snapshot) => {
    if (disposed) return;
    const ids = new Set(snapshot.projects.map((project) => project.id));
    for (const id of ids) watchProject(id);
    for (const [id, promise] of projectSubs) {
      if (ids.has(id)) continue;
      snapshots.delete(id);
      projectSubs.delete(id);
      void promise.then((stop) => stop(), () => undefined);
    }
  }).then((stop) => {
    stopProjects = stop;
    if (disposed) stopProjects();
  }, () => undefined);

  /** Call on every task-list refresh (review #1: this wires the watcher). */
  const sync = (tasks: readonly WatchedTask[]): void => {
    if (disposed) return;
    watched = [...tasks];
    // Drop memory of sessions nothing points at anymore (bounded growth).
    const live = new Set(watched.map((t) => t.sessionId));
    for (const id of seenIn.keys()) if (!live.has(id)) seenIn.delete(id);
    evaluate();
  };

  const dispose = (): void => {
    disposed = true;
    stopProjects?.();
    for (const promise of projectSubs.values()) void promise.then((stop) => stop(), () => undefined);
    projectSubs.clear();
    snapshots.clear();
  };

  return { sync, dispose };
};
