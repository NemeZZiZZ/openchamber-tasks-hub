// Orphan-session watcher: every registered project is watched for a
// top-level, not-archived session no task points at. "Going forward only"
// is enforced by the caller via the persisted watermark — not here (a
// page-type extension can't stay running across the navigation that
// starting a session itself causes; kanban pattern).
import { isAdoptable, titleForOrphanSession, type OrphanCandidate } from '../domain/autoTask.ts';

export type OrphanSessionsHost = {
  onProjects(listener: (snapshot: { state: string; projects: ReadonlyArray<{ id: string; directory: string; name?: string }> }) => void): Promise<() => void>;
  onSessions(projectId: string, listener: (snapshot: { state: string; coverage?: ReadonlyArray<{ directory: string; state: string }>; sessions: ReadonlyArray<OrphanCandidate & { createdAt: number }> }) => void): Promise<() => void>;
};

export type OrphanFound = { projectId: string; sessionId: string; title: string; createdAt: number };

export const watchOrphanSessions = (
  host: OrphanSessionsHost,
  getLinkedSessionIds: () => ReadonlySet<string>,
  onFound: (found: OrphanFound) => void,
) => {
  let disposed = false;
  const projectSubs = new Map<string, Promise<() => void>>();
  const projectNames = new Map<string, string>();

  const applySnapshot = (projectId: string, snapshot: { sessions: ReadonlyArray<OrphanCandidate & { createdAt: number }> }) => {
    if (disposed) return;
    const linked = getLinkedSessionIds();
    for (const session of snapshot.sessions) {
      if (!isAdoptable(session, linked)) continue;
      onFound({
        projectId,
        sessionId: session.id,
        title: titleForOrphanSession(session, projectNames.get(projectId) ?? null),
        createdAt: session.createdAt,
      });
    }
  };

  const watchProject = (projectId: string) => {
    if (projectSubs.has(projectId)) return;
    const promise = host.onSessions(projectId, (snapshot) => applySnapshot(projectId, snapshot));
    projectSubs.set(projectId, promise);
    void promise.then((stop) => {
      if (disposed || !projectSubs.has(projectId)) stop();
    }, () => undefined);
  };

  const stopProjectsPromise = host.onProjects((snapshot) => {
    if (disposed) return;
    for (const project of snapshot.projects) projectNames.set(project.id, project.name ?? project.directory);
    const ids = new Set(snapshot.projects.map((project) => project.id));
    for (const id of ids) watchProject(id);
    for (const [id, promise] of projectSubs) {
      if (ids.has(id)) continue;
      projectSubs.delete(id);
      void promise.then((stop) => stop(), () => undefined);
    }
  });

  const dispose = () => {
    disposed = true;
    void stopProjectsPromise.then((stop) => stop(), () => undefined);
    for (const promise of projectSubs.values()) void promise.then((stop) => stop(), () => undefined);
    projectSubs.clear();
  };

  return { dispose };
};
