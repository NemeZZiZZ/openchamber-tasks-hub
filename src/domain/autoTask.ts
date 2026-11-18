// Orphan-session adoption candidates (kanban autoTask pattern). The
// duplicate-adopt guard is the linkedSessionIds set a caller feeds in —
// claim happens at adoption time on the caller side.
export type OrphanCandidate = {
  id: string;
  title: string;
  parentId: string | null;
  archivedAt: number | null;
};

/** Structural eligibility only: a real top-level session, not archived, that no task already points to. */
export const isAdoptable = (
  session: Pick<OrphanCandidate, 'id' | 'parentId' | 'archivedAt'>,
  linkedSessionIds: ReadonlySet<string>,
): boolean => session.parentId === null && session.archivedAt === null && !linkedSessionIds.has(session.id);

/**
 * The host falls back to the session's own id as its title until a real one
 * is generated; an id-looking title is not a title (kanban rule).
 */
export const titleForOrphanSession = (
  session: Pick<OrphanCandidate, 'id' | 'title'>,
  projectName?: string | null,
): string => {
  const title = session.title.trim();
  if (title && title !== session.id) return title.slice(0, 200);
  return projectName ? `New session in ${projectName}` : `New session (${session.id.slice(0, 8)})`;
};

/**
 * Start Agent plan for a task. A local task or a remote task whose
 * projectRef has no registered checkout prompts the user to pick a project
 * root — no auto-clone in v0.0.0 (design call). A remote task whose repo is
 * a known workspace project starts directly in it.
 */
export type StartAgentPlan =
  | { mode: 'prompt-root' }
  | { mode: 'direct'; directory: string };

export const startAgentPlan = (
  task: { adapterId: string; projectRef: string | null },
  projects: ReadonlyArray<{ directory: string; remoteKeys?: ReadonlyArray<string> }>,
): StartAgentPlan => {
  if (!task.projectRef) return { mode: 'prompt-root' };
  const repo = task.projectRef.replace(/^[^:]+:/, '');
  for (const project of projects) {
    const keys = project.remoteKeys ?? [];
    if (keys.some((key) => key.replace(/^[^:]+:/, '') === repo)) return { mode: 'direct', directory: project.directory };
  }
  return { mode: 'prompt-root' };
};
