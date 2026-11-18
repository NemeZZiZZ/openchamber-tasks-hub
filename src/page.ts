// Full-screen page: the primary surface — table ⇄ kanban shell over the
// service task list, plus the Start Agent handoff (host.startSession in
// the picked project). Linkage (attention, unlink, adoption) lives in the
// extracted controller (review #12); transport is createSvc everywhere.
import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import type { JsonValue } from '@openchamber/sdk';
import { mountShell } from './ui/shell.ts';
import { createLinkageController } from './host/linkage.ts';
import { createSvc, ServiceError } from './host/serviceClient.ts';
import { describeHostError, describeStartSessionDelivery } from './host/workspace.ts';
import type { UnifiedTask } from './domain/task.ts';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing #root');
const pageRoot = root as HTMLElement;

const svc = createSvc(host);

const unlinkNote = (message: string): void => {
  void host.toast({ kind: 'info', message }).catch(() => undefined);
};

let mounted: { refresh: () => Promise<void>; dispose: () => void } | null = null;
let controller: ReturnType<typeof createLinkageController> | null = null;
host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  if (mounted) return;
  mounted = mountShell(host, pageRoot, {
    // A task never starts a session without a project root: the shell
    // either resolved one by repo match or made the user pick (no clone).
    onStartAgent: (task: UnifiedTask, projectId: string | null) => {      if (!projectId) {
        unlinkNote('No project root selected — nothing started.');
        return;
      }
      void host.startSession({
        providerId: 'local',
        id: task.id,
        title: task.title.slice(0, 200),
        url: task.url ?? '',
        text: task.description || task.title,
        projectId,
      }).then(async (result) => {
        // Persist the link immediately: a session that never got linked is
        // invisible to Open Chat and unlink (review #1).
        if (result.sessionId && controller) {
          try {
            await controller.linkSession(task, result.sessionId);
          } catch (err) {
            unlinkNote(`Session started, but the link was not saved: ${err instanceof ServiceError ? err.message : String(err)}`);
          }
        }
        const problem = describeStartSessionDelivery(result.sent);
        if (problem) unlinkNote(`Session started, but the description was not delivered: ${problem}.`);
        // Re-list: the shell feeds the fresh tasks to the linkage
        // controller through onRefreshed below (no second /tasks fetch).
        void mounted?.refresh();
      }, (err: unknown) => unlinkNote(`Start Agent failed: ${describeHostError(err)}`));
    },
    onOpenChat: (task: UnifiedTask) => {
      if (task.sessionId) void host.openSession(task.sessionId);
    },
    notify: unlinkNote,
    onOpenUrl: (url: string) => { void host.openUrl(url).catch(() => undefined); },
    // The task list is the linkage feed: every shell refresh reaches the
    // controller (pre-publish review: without sync() the watcher never
    // sees a snapshot, and orphan adoption runs on an empty linked set).
    onRefreshed: (tasks) => controller?.sync(tasks),
  });

  controller = createLinkageController(host, svc, {
    keys: () => host.storage.keys(),
    get: async (key: string) => await host.storage.get(key),
    set: (key: string, value: unknown) => host.storage.set(key, value as JsonValue),
    delete: (key: string) => host.storage.delete(key),
  }, {
    refresh: () => { void mounted?.refresh(); },
    note: unlinkNote,
  });
});

window.addEventListener('pagehide', () => {
  controller?.dispose();
  mounted?.dispose();
  host.dispose();
});
