// Pure per-adapter status/list mapping (kanban sync.ts pattern): remote
// payload → board listId, and a listId move → the write-back actions the
// adapter must perform. Columns are the remote board's own lists, not a
// fixed five (user decision 2026-11-18).
import { TASK_STATUSES, type AdapterId, type TaskStatus } from './task.ts';

// Remote payload slice the mapping needs (defensive: never throws).
export type RemoteLike = { state?: unknown; labels?: unknown; status?: unknown; listId?: unknown };

// For gitlab, listId === the board-list label title: moving columns is
// add/remove list label (design: "move = add/remove list label for GitLab").
// 'open' is the default list and carries no label.
const GITLAB_LIST_LABELS = ['in progress', 'review', 'done'] as const;

// Adapters whose columns are the platform's own ids/names, passed through
// the payload's listId (review #7: one shared set, not cascades).
const PASSTHROUGH_ADAPTERS: ReadonlySet<AdapterId> = new Set<AdapterId>(['trello', 'linear', 'jira']);

export function toListId(adapter: AdapterId, remote: RemoteLike): string {
  const r = (typeof remote === 'object' && remote !== null ? remote : {}) as RemoteLike;
  if (adapter === 'github') return r.state === 'closed' ? 'done' : 'open';
  if (adapter === 'local') {
    const s = r.status;
    return TASK_STATUSES.includes(s as TaskStatus) ? (s as TaskStatus) : 'todo';
  }
  // Trello/Linear/Jira columns are the platform's own ids/names: passthrough
  // of the payload's listId (set by each adapter), 'open' when absent.
  if (PASSTHROUGH_ADAPTERS.has(adapter)) {
    return typeof r.listId === 'string' && r.listId.length > 0 ? r.listId : 'open';
  }
  // gitlab: Done = closed state wins over labels (Done = close, decision 8).
  if (r.state === 'closed') return 'done';
  const labels = Array.isArray(r.labels) ? r.labels.filter((l): l is string => typeof l === 'string') : [];
  for (const id of ['review', 'in progress']) {
    if (labels.includes(id)) return id;
  }
  return 'open';
}

export type WritePatch = {
  addLabels: string[];
  removeLabels: string[];
  retainedLabels: string[];
  close: boolean;
  reopen: boolean;
};

// Reverse mapping: what must change on the remote when a card moves from
// fromListId to toListId. Non-mapping labels are always preserved
// (user decision 8). Same-list moves produce a no-op patch.
export function toWritePatch(
  adapter: AdapterId,
  fromListId: string,
  toListId: string,
  labels: string[],
): WritePatch {
  const clean = Array.isArray(labels) ? labels.filter((l) => typeof l === 'string') : [];
  const noop: WritePatch = { addLabels: [], removeLabels: [], retainedLabels: clean, close: false, reopen: false };
  if (fromListId === toListId) return noop;
  // Trello/Linear/Jira moves are platform-native list/state changes; the
  // adapters translate them directly (no label bookkeeping, no close/reopen).
  if (PASSTHROUGH_ADAPTERS.has(adapter)) return noop;

  const labelBased = adapter === 'gitlab';
  const addLabels = labelBased && (GITLAB_LIST_LABELS as readonly string[]).includes(toListId)
    ? [toListId]
    : [];
  const removeLabels = labelBased && fromListId !== 'open' && (GITLAB_LIST_LABELS as readonly string[]).includes(fromListId)
    ? [fromListId]
    : [];
  return {
    addLabels,
    removeLabels,
    retainedLabels: clean.filter((l) => !addLabels.includes(l) && !removeLabels.includes(l)),
    close: toListId === 'done' && adapter !== 'local',
    reopen: fromListId === 'done' && adapter !== 'local',
  };
}

// Coarse status for rail counts/sorting; columns themselves render by listId.
export function statusForListId(adapter: AdapterId, listId: string): TaskStatus {
  if (listId === 'done') return 'done';
  if (adapter === 'local') {
    return TASK_STATUSES.includes(listId as TaskStatus) ? (listId as TaskStatus) : 'todo';
  }
  if (adapter === 'gitlab') {
    if (listId === 'in progress') return 'in_progress';
    if (listId === 'review') return 'review';
    return 'todo';
  }
  // github: everything open is todo (no columns in v0.0.0).
  return 'todo';
}
