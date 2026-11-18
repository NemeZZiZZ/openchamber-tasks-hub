// Pure domain: the one task model the board renders, plus validation and
// patch application. No SDK/DOM imports (kanban domain/ pattern).

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type SyncState = 'synced' | 'saving' | 'error';

// Single source of truth for adapter ids (review #7): the type, the
// registry keys and validateTask all derive from this one list.
export const ADAPTER_IDS = ['local', 'github', 'gitlab', 'trello', 'linear', 'jira'] as const;
export type AdapterId = typeof ADAPTER_IDS[number];

// Exactly per design spec. The board renders this shape only — never raw
// GitHub/GitLab payloads (anti-goal).
export type UnifiedTask = {
  id: string;               // tas_<adapter>_<externalId> or t_<local>
  adapterId: AdapterId;
  externalId: string;       // issue iid/number as string; local id for local
  url: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  listId: string;           // v0.0.0: board list the card sits in
  rank: number;             // local ordering; remote order = updatedAt desc
  projectRef: string | null; // repo key e.g. github:owner/repo
  assignee: string | null;
  labels: string[];
  updatedAt: number;
  syncState: SyncState;
  syncError: string | null;
  sessionId: string | null; // kanban linkage, local-only concern
  needsAttentionSince: number | null;
  // Optional rich-card fields (board parity); absent on old cached rows.
  author?: string | null;
  closed?: boolean;
  milestone?: string | null;
  dueDate?: string | null;   // ISO date or datetime
  comments?: number;
  checklist?: { done: number; total: number } | null;
};

// Service PATCH body shape; also what applyPatch consumes. fromListId is
// the card's current board list, sent by the UI (or filled by the engine)
// so adapters can do add/remove-label bookkeeping without an extra GET.
export type TaskPatch = {
  title?: string;
  description?: string;
  status?: TaskStatus;
  listId?: string;
  labels?: string[];
  fromListId?: string;
  // Incremental label edits (label-backed columns); adapters merge them
  // with the issue's current labels so non-mapping labels survive.
  addLabels?: string[];
  removeLabels?: string[];
  // Field edits (lifecycle design 2026-11-21): display value + native id
  // travel together — display feeds applyPatch/the cached rows, the native
  // id is what adapter.update sends to the platform. null clears.
  assignee?: string | null;
  assigneeId?: string | null;
  milestone?: string | null;
  milestoneId?: string | null;
  dueDate?: string | null;   // ISO yyyy-mm-dd
};

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v);
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);

const asTaskStatus = (v: unknown): TaskStatus =>
  TASK_STATUSES.includes(v as TaskStatus) ? (v as TaskStatus) : 'todo';

// Factory for local tasks: "external system" = the extension's own store.
export function createLocalTask(input: {
  id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  now?: number;
}): UnifiedTask {
  const status = asTaskStatus(input.status);
  return {
    id: `t_${input.id}`,
    adapterId: 'local',
    externalId: input.id,
    url: null,
    title: isStr(input.title) ? input.title : '',
    description: isStr(input.description) ? input.description : '',
    status,
    listId: status,
    rank: 0,
    projectRef: null,
    assignee: null,
    labels: [],
    updatedAt: input.now ?? 0,
    syncState: 'synced',
    syncError: null,
    sessionId: null,
    needsAttentionSince: null,
  };
}

// Defensive parse for stored records: malformed → null, caller skips.
export function validateTask(raw: unknown): UnifiedTask | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (!isStr(t.id) || t.id.length === 0) return null;
  if (!(ADAPTER_IDS as readonly string[]).includes(t.adapterId as string)) return null;
  if (!isStr(t.externalId) || t.externalId.length === 0) return null;
  if (!isStrOrNull(t.url)) return null;
  if (!isStr(t.title)) return null;
  if (!isStr(t.description)) return null;
  if (!TASK_STATUSES.includes(t.status as TaskStatus)) return null;
  if (!isStr(t.listId) || t.listId.length === 0) return null;
  if (!isNum(t.rank)) return null;
  if (!isStrOrNull(t.projectRef)) return null;
  if (!isStrOrNull(t.assignee)) return null;
  if (!Array.isArray(t.labels) || !t.labels.every((l) => isStr(l))) return null;
  if (!isNum(t.updatedAt)) return null;
  if (t.syncState !== 'synced' && t.syncState !== 'saving' && t.syncState !== 'error') return null;
  if (!isStrOrNull(t.syncError)) return null;
  if (!isStrOrNull(t.sessionId)) return null;
  if (!isNumOrNull(t.needsAttentionSince)) return null;
  return raw as UnifiedTask;
}

// Pure apply: returns a new task, never mutates; unknown fields ignored;
// bad values coerced (labels filtered to strings).
export function applyPatch(t: UnifiedTask, patch: TaskPatch, now?: number): UnifiedTask {
  const p = (typeof patch === 'object' && patch !== null ? patch : {}) as Record<string, unknown>;
  const next: UnifiedTask = { ...t };
  if (isStr(p.title)) next.title = p.title;
  if (isStr(p.description)) next.description = p.description;
  if (TASK_STATUSES.includes(p.status as TaskStatus)) next.status = p.status as TaskStatus;
  if (isStr(p.listId) && p.listId.length > 0) next.listId = p.listId;
  if (Array.isArray(p.labels)) next.labels = p.labels.filter((l) => isStr(l));
  else if (Array.isArray(p.addLabels) || Array.isArray(p.removeLabels)) {
    const drop = new Set(Array.isArray(p.removeLabels) ? p.removeLabels.filter(isStr) : []);
    const merged = next.labels.filter((l) => !drop.has(l));
    for (const l of Array.isArray(p.addLabels) ? p.addLabels.filter(isStr) : []) if (!merged.includes(l)) merged.push(l);
    next.labels = merged;
  }
  if (p.assignee === null || isStr(p.assignee)) next.assignee = p.assignee;
  if (p.milestone === null || isStr(p.milestone)) next.milestone = p.milestone;
  if (p.dueDate === null || isStr(p.dueDate)) next.dueDate = p.dueDate;
  if (now !== undefined) next.updatedAt = now;
  return next;
}
