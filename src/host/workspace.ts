// Host workspace helpers for Start Agent (kanban workspace.ts pattern,
// trimmed to what the tasks board needs): one-off project/session/worktree
// lookups and the StartSession delivery explanation.
import { HostRequestError, type HostClient, type GuestSessionRecord, type StartSessionSent } from '@openchamber/sdk';
import type { Svc } from './serviceClient.ts';

export type WorkspaceHost = Pick<HostClient, 'onProjects' | 'onSessions' | 'onWorktrees' | 'openSession' | 'startSession'>;

export type SessionsResult = { complete: boolean; sessions: GuestSessionRecord[] };

/** One-off session list for a project; releases the subscription on resolve. */
export const fetchSessions = (host: WorkspaceHost, projectId: string, timeoutMs = 8000): Promise<SessionsResult> =>
  new Promise((resolve, reject) => {
    let last: { state: string; sessions?: GuestSessionRecord[] } | null = null;
    let settled = false;
    let release: (() => void) | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release?.();
      const all = (last?.sessions ?? []).filter((session) => session.parentId === null);
      resolve({ complete: last?.state === 'ready', sessions: all.filter((session) => session.archivedAt === null) });
    };
    const timer = setTimeout(finish, timeoutMs);
    host.onSessions(projectId, (snapshot) => {
      last = snapshot as { state: string; sessions?: GuestSessionRecord[] };
      if (last.state !== 'loading') finish();
    }).then((stop) => {
      release = stop;
      if (settled) stop();
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });

export type WorktreesResult = { complete: boolean; directories: string[] };

export const fetchWorktrees = (host: WorkspaceHost, projectId: string, timeoutMs = 8000): Promise<WorktreesResult> =>
  new Promise((resolve, reject) => {
    let last: { state: string; worktrees?: ReadonlyArray<{ directory: string; status?: string }> } | null = null;
    let settled = false;
    let release: (() => void) | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release?.();
      resolve({ complete: last?.state === 'ready', directories: (last?.worktrees ?? []).map((w) => w.directory) });
    };
    const timer = setTimeout(finish, timeoutMs);
    host.onWorktrees(projectId, (snapshot) => {
      last = snapshot as { state: string; worktrees?: ReadonlyArray<{ directory: string; status?: string }> };
      if (last.state !== 'loading') finish();
    }).then((stop) => {
      release = stop;
      if (settled) stop();
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });

export const describeHostError = (error: unknown): string => {
  if (error instanceof HostRequestError) {
    switch (error.code) {
      case 'NOT_GRANTED': return 'This needs the "sessions" permission. Approve it in Settings → Extensions.';
      case 'DISABLED': return 'The extension is paused in Settings → Extensions.';
      case 'HOST_UNAVAILABLE': return 'Not running inside OpenChamber.';
      case 'HOST_TIMEOUT': return 'OpenChamber did not answer in time. Try again.';
      case 'NOT_FOUND': return 'That session no longer exists.';
      default: return `${error.code}: ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
};

/** Why the task description may not have reached the agent as message #1. */
export const describeStartSessionDelivery = (sent: StartSessionSent): string | null => {
  switch (sent) {
    case 'sent': return null;
    case 'no-model': return 'no model is configured for this session';
    case 'skipped': return 'OpenChamber skipped sending it — check the chat';
    case 'failed': return 'OpenChamber reported the send itself failed';
  }
};

// Report the workspace project roots to the service so empty-`repos`
// discovery can read their git remotes (review UX #3 — without this call
// the discovery never sees a directory and GitHub/GitLab stay silent-empty).
export const reportWorkspace = async (svc: Svc, directories: readonly string[]): Promise<void> => {
  if (directories.length === 0) return;
  await svc('POST', '/workspace', { directories: [...directories] });
};
