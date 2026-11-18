/**
 * Link health: whether what a task points at — its session, or its worktree —
 * still exists on the host. The answer is only ever trusted as deleted or
 * gone when the snapshot provably finished loading; anything less is
 * "unknown", and a caller must never act on "unknown" — an incomplete list
 * is not a disappearance (kanban semantics verbatim).
 */
export type LinkState = 'linked' | 'gone' | 'unknown';
export type SessionGoneReason = 'deleted' | 'archived';
export type SessionLinkState = 'linked' | SessionGoneReason | 'unknown';

export type LoadState = 'loading' | 'ready' | 'error';

export type SessionsView = {
  state: LoadState;
  coverage: ReadonlyArray<{ directory: string; state: LoadState }>;
  sessions: ReadonlyArray<{ id: string; directory: string; archivedAt: number | null }>;
};

export type WorktreesView = {
  state: LoadState;
  worktrees: ReadonlyArray<{ directory: string; status: 'ready' | 'pending' | 'invalid' | 'missing' }>;
};

/**
 * Whether a linked session still exists. Archived is reported separately
 * from deleted so callers can act appropriately. Absence is trusted only
 * when the snapshot and its directory coverage finished loading.
 */
export const sessionLinkState = (sessionId: string, directory: string | null, view: SessionsView): SessionLinkState => {
  const found = view.sessions.find((session) => session.id === sessionId);
  if (found) return found.archivedAt === null ? 'linked' : 'archived';
  if (view.state !== 'ready') return 'unknown';
  if (directory !== null) {
    const entry = view.coverage.find((coverage) => coverage.directory === directory);
    if (entry && entry.state !== 'ready') return 'unknown';
    return 'deleted';
  }
  return view.coverage.some((coverage) => coverage.state !== 'ready') ? 'unknown' : 'deleted';
};

export const worktreeLinkState = (directory: string, view: WorktreesView): LinkState => {
  if (view.state !== 'ready') return 'unknown';
  const found = view.worktrees.find((worktree) => worktree.directory === directory);
  if (!found) return 'gone';
  return found.status === 'missing' ? 'gone' : 'linked';
};

/**
 * What to do when a linked session is gone: deleting the session deletes a
 * LOCAL task outright (kanban rule), but a mirrored remote task only loses
 * its local link — the remote issue is never touched.
 */
export const dispositionForGoneSession = (adapterId: string): 'delete-task' | 'clear-link' =>
  adapterId === 'local' ? 'delete-task' : 'clear-link';
