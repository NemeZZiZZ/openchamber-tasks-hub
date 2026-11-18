// Linkage controller (review #12): the panel-side brain for Start Agent →
// link, live attention → badge writes, session-gone → unlink, and orphan
// adoption. Extracted from page.ts so the transitions are unit-testable;
// all transport goes through createSvc (status-honoring).
import type { UnifiedTask } from '../domain/task.ts';
import { createSessionSync, mapTasksToWatched } from './sessionSync.ts';
import { watchOrphanSessions } from './orphanSessions.ts';
import { loadWatermark, saveWatermark } from '../store/orphanWatermark.ts';
import type { Svc } from './serviceClient.ts';
import type { StorageClient } from '../adapters/types.ts';

export type LinkageHost = {
  onProjects: Parameters<typeof watchOrphanSessions>[0]['onProjects'] & Parameters<typeof createSessionSync>[0]['onProjects'];
  onSessions: Parameters<typeof createSessionSync>[0]['onSessions'] & Parameters<typeof watchOrphanSessions>[0]['onSessions'];
};

export type LinkageCallbacks = {
  /** Refresh the task list after a linkage write. */
  refresh(): void;
  /** Non-blocking user note (toast). */
  note(message: string): void;
};

export const createLinkageController = (
  host: LinkageHost,
  svc: Svc,
  storage: StorageClient,
  cb: LinkageCallbacks,
) => {
  let latestTasks: UnifiedTask[] = [];
  let disposed = false;

  const linkedSessionIds = (): ReadonlySet<string> => {
    const ids = new Set<string>();
    for (const t of latestTasks) if (t.sessionId) ids.add(t.sessionId);
    return ids;
  };

  // Session-gone: local task → DELETE through the service (its store holds
  // local records); remote → clear the overlay link only.
  const handleGone = async (taskId: string, reason: 'deleted' | 'archived'): Promise<void> => {
    const task = latestTasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      if (task.adapterId === 'local') {
        await svc('DELETE', `/tasks/local/${encodeURIComponent(task.externalId)}`);
        cb.note(`Session ${reason}; local task deleted.`);
      } else {
        await svc('POST', '/link', { adapterId: task.adapterId, externalId: task.externalId, patch: { sessionId: null } });
        cb.note(`Session ${reason}; remote task kept, link cleared.`);
      }
      cb.refresh();
    } catch (err) {
      cb.note(`Unlink failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const sessionSync = createSessionSync(
    host,
    async (taskId, action, now) => {
      if (action === 'keep') return;
      const task = latestTasks.find((t) => t.id === taskId);
      if (!task || task.adapterId === 'local' || !task.externalId) return;
      const next = action === 'set' ? (task.needsAttentionSince ?? now) : null;
      // Skip no-op writes: repeated waiting snapshots would otherwise spam
      // /link on every session event.
      if ((task.needsAttentionSince ?? null) === next) return;
      try {
        await svc('POST', '/link', {
          adapterId: task.adapterId,
          externalId: task.externalId,
          patch: { needsAttentionSince: next },
        });
        task.needsAttentionSince = next; // batched: no refetch needed
      } catch {
        // Badge writes are best-effort; the next snapshot re-evaluates.
      }
    },
    (taskId, _sessionId, reason) => { void handleGone(taskId, reason); },
  );

  // Orphan adoption: going-forward only (persisted watermark), reconcile —
  // the linked set above is fed from the refreshed task list — before adopt.
  // The watermark starts at "now" on first run so pre-existing top-level
  // sessions are never adopted (pre-publish review).
  let watermark = 0;
  const watermarkReady = (async () => {
    watermark = await loadWatermark(storage);
    if (!(watermark > 0)) {
      watermark = Date.now();
      await saveWatermark(storage, watermark).catch(() => undefined);
    }
  })();

  const adopting = new Set<string>();
  const adopt = async (sessionId: string, title: string, createdAt: number): Promise<void> => {
    await watermarkReady;
    if (disposed) return;
    // One adoption per session (snapshots repeat), and nothing created
    // before the watermark (going-forward only).
    if (adopting.has(sessionId) || !(createdAt > watermark)) return;
    adopting.add(sessionId);
    try {
      const created = await svc<{ task?: { adapterId: string; externalId: string } }>('POST', '/tasks', {
        adapterId: 'local', title, description: '',
      });
      if (created?.task) {
        await svc('POST', '/link', { adapterId: 'local', externalId: created.task.externalId, patch: { sessionId } });
      }
      watermark = Math.max(watermark, createdAt);
      await saveWatermark(storage, watermark);
      cb.refresh();
    } catch {
      cb.note('Could not adopt a new session as a local task.');
    } finally {
      adopting.delete(sessionId);
    }
  };

  const orphanWatcher = watchOrphanSessions(host, linkedSessionIds, (found) => {
    void adopt(found.sessionId, found.title, found.createdAt);
  });

  return {
    /** Feed the refreshed task list to every watcher (reconcile before adopt). */
    sync(tasks: readonly UnifiedTask[]): void {
      if (disposed) return;
      latestTasks = [...tasks];
      sessionSync.sync(mapTasksToWatched(latestTasks));
    },
    /** Start Agent handoff: persist the new session link (review #1). */
    linkSession: async (task: UnifiedTask, sessionId: string): Promise<void> => {
      await svc('POST', '/link', { adapterId: task.adapterId, externalId: task.externalId, patch: { sessionId } });
    },
    dispose(): void {
      disposed = true;
      sessionSync.dispose();
      orphanWatcher.dispose();
    },
  };
};
