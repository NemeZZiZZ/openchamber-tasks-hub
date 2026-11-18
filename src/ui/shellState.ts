// Pure view-state for the table ⇄ kanban shell (no DOM): filtering,
// ordering and grouping over UnifiedTask rows. Unit-tested in
// test/shellState.test.ts.
import type { AdapterCapabilities } from '../adapters/types.ts';
import type { UnifiedTask } from '../domain/task.ts';
import { sourceLabel } from './present.ts';

export type ViewMode = 'table' | 'kanban';

export type { GroupBy } from '../store/prefs.ts';
import type { GroupBy } from '../store/prefs.ts';

// assignee/author/label: undefined or 'all' = no filter; assignee also takes
// '__none__' (unassigned). state: open/closed by the task's closed flag.
export type ShellFilter = {
  adapter: string;
  project: string;
  query: string;
  assignee?: string;
  label?: string;
  author?: string;
  state?: 'all' | 'open' | 'closed';
};

export const NONE = '__none__';

export const isClosed = (task: UnifiedTask): boolean => task.closed ?? (task.listId === 'done' || task.status === 'done');

export const matchesShellFilter = (task: UnifiedTask, filter: ShellFilter): boolean => {
  if (filter.state === 'open' && isClosed(task)) return false;
  if (filter.state === 'closed' && !isClosed(task)) return false;
  if (filter.assignee && filter.assignee !== 'all') {
    if (filter.assignee === NONE ? task.assignee !== null : task.assignee !== filter.assignee) return false;
  }
  if (filter.author && filter.author !== 'all' && task.author !== filter.author) return false;
  if (filter.label && filter.label !== 'all' && !task.labels.includes(filter.label)) return false;
  if (filter.adapter !== 'all' && task.adapterId !== filter.adapter) return false;
  if (filter.project !== 'all') {
    if (filter.project === '__none__' ? task.projectRef !== null : task.projectRef !== filter.project) return false;
  }
  const query = filter.query.trim().toLowerCase();
  if (!query) return true;
  return `${task.title}\n${task.description}\n${task.assignee ?? ''}`.toLowerCase().includes(query);
};

// Table: newest activity first (design call). Errors still surface, sorted
// into place — no hiding.
export const tableOrder = (tasks: readonly UnifiedTask[], filter: ShellFilter): UnifiedTask[] =>
  tasks
    .filter((t) => matchesShellFilter(t, filter))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

// Board: dynamic columns = the lists the data actually has (GitLab lists,
// GitHub open/done, local statuses), first-seen order for stability; cards
// keep fractional rank when present, then newest-first; the attention badge
// leads its column (kanban byReviewUrgency semantics, v0.0.0 badge-only).
export type BoardGroup = { listId: string; cards: UnifiedTask[] };

export const boardGroups = (tasks: readonly UnifiedTask[], filter: ShellFilter): BoardGroup[] => {
  const visible = tasks.filter((t) => matchesShellFilter(t, filter));
  const order: string[] = [];
  const byList = new Map<string, UnifiedTask[]>();
  for (const task of visible) {
    let list = byList.get(task.listId);
    if (!list) {
      list = [];
      byList.set(task.listId, list);
      order.push(task.listId);
    }
    list.push(task);
  }
  const cardOrder = (a: UnifiedTask, b: UnifiedTask): number => {
    if (a.needsAttentionSince !== null && b.needsAttentionSince !== null) return b.needsAttentionSince - a.needsAttentionSince;
    if (a.needsAttentionSince !== null) return -1;
    if (b.needsAttentionSince !== null) return 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
  };
  return order.map((listId) => ({ listId, cards: (byList.get(listId) ?? []).sort(cardOrder) }));
};

// Known-empty columns so a drag target always exists even when no card is
// in that list yet (review UX #4): local → its five statuses; github →
// open/done; gitlab → done (close). Label-driven lists (GitLab, Trello,
// Linear, Jira) stay data-only.
export const extraBoardLists = (visible: readonly UnifiedTask[]): string[] => {
  const adapters = new Set(visible.map((t) => t.adapterId));
  const extras: string[] = [];
  if (adapters.has('local')) extras.push('backlog', 'todo', 'in_progress', 'review', 'done');
  if (adapters.has('github')) extras.push('open', 'done');
  if (adapters.has('gitlab')) extras.push('done');
  return [...new Set(extras)];
};

// boardGroups + known-empty columns appended after the data columns, then
// the user's persisted column order applied on top (review UX round 2).
export const boardGroupsWithExtras = (
  tasks: readonly UnifiedTask[],
  filter: ShellFilter,
  columnOrder: readonly string[] = [],
): BoardGroup[] => {
  const groups = boardGroups(tasks, filter);
  const visible = tasks.filter((t) => matchesShellFilter(t, filter));
  for (const listId of extraBoardLists(visible)) {
    if (!groups.some((g) => g.listId === listId)) groups.push({ listId, cards: [] });
  }
  return applyColumnOrder(groups, columnOrder);
};

// Column reorder (review UX round 2): listIds named in `order` come first,
// in that order; lists the order doesn't know (a new GitLab list, or extras
// not yet dragged) keep their data order after them.
export const applyColumnOrder = (
  groups: readonly BoardGroup[],
  order: readonly string[],
): BoardGroup[] => {
  if (order.length === 0) return [...groups];
  const known = order
    .map((listId) => groups.find((g) => g.listId === listId))
    .filter((g): g is BoardGroup => g !== undefined);
  const rest = groups.filter((g) => !order.includes(g.listId));
  return [...known, ...rest];
};

// Columns a "Move to" affordance offers: every other list the board shows.
export const otherLists = (groups: readonly BoardGroup[], current: string): string[] =>
  groups.map((g) => g.listId).filter((id) => id !== current);

// Fractional rank for a drop between two cards (kanban planDrop, compact).
const RANK_STEP = 1024;
const MIN_GAP = 1e-6;
export const planDrop = (visible: readonly UnifiedTask[], movingId: string, beforeId: string | null): number => {
  const column = visible.filter((t) => t.id !== movingId);
  const index = beforeId === null ? column.length : column.findIndex((t) => t.id === beforeId);
  const at = index < 0 ? column.length : index;
  const prev = column[at - 1];
  const next = column[at];
  if (!prev && !next) return RANK_STEP;
  if (!next) return prev!.rank + RANK_STEP;
  if (!prev) return Math.max(0, next.rank - RANK_STEP);
  if (next.rank - prev.rank > MIN_GAP) return (prev.rank + next.rank) / 2;
  return at * RANK_STEP;
};

// Rail counts: open tasks + per-adapter error badges.
export type RailCounts = { open: number; total: number; errorsByAdapter: Record<string, string> };
export const railCounts = (tasks: readonly UnifiedTask[]): RailCounts => {
  const errorsByAdapter: Record<string, string> = {};
  for (const t of tasks) {
    if (t.syncState === 'error' && t.syncError && !(t.adapterId in errorsByAdapter)) {
      errorsByAdapter[t.adapterId] = t.syncError;
    }
  }
  return {
    open: tasks.filter((t) => t.status !== 'done').length,
    total: tasks.length,
    errorsByAdapter,
  };
};

// Distinct values for the filter / group selectors, sorted.
export type FilterOptions = { assignees: string[]; labels: string[]; authors: string[]; milestones: string[] };
export const filterOptions = (tasks: readonly UnifiedTask[]): FilterOptions => {
  const assignees = new Set<string>();
  const labels = new Set<string>();
  const authors = new Set<string>();
  const milestones = new Set<string>();
  for (const t of tasks) {
    if (t.assignee) assignees.add(t.assignee);
    if (t.author) authors.add(t.author);
    if (t.milestone) milestones.add(t.milestone);
    for (const l of t.labels) labels.add(l);
  }
  const sorted = (set: Set<string>): string[] => [...set].sort((a, b) => a.localeCompare(b));
  return { assignees: sorted(assignees), labels: sorted(labels), authors: sorted(authors), milestones: sorted(milestones) };
};

// ---- grouping (GitHub Projects style) + label-backed columns (GitLab) ----
export const OPEN_COLUMN = '__open__';
export const CLOSED_COLUMN = '__closed__';
export const LABEL_PREFIX = 'label:';
export const NO_ASSIGNEE = '__unassigned__';
export const NO_MILESTONE = '__no_milestone__';

export type GroupOptions = {
  groupBy: GroupBy;
  labelLists: readonly string[];
  columnOrder: readonly string[];
  hideEmpty: boolean;
  hideClosed: boolean;
};

// Only status and label grouping accept drops (a move maps to a write).
export const groupingWritable = (groupBy: GroupBy): boolean => groupBy === 'status' || groupBy === 'label';

const sortCards = (a: UnifiedTask, b: UnifiedTask): number => {
  if (a.needsAttentionSince !== null && b.needsAttentionSince !== null) return b.needsAttentionSince - a.needsAttentionSince;
  if (a.needsAttentionSince !== null) return -1;
  if (b.needsAttentionSince !== null) return 1;
  if (a.rank !== b.rank) return a.rank - b.rank;
  return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
};

const bucket = (
  visible: readonly UnifiedTask[],
  keys: (t: UnifiedTask) => string[],
  seed: readonly string[],
  fallbackLast: readonly string[] = [],
): BoardGroup[] => {
  const byKey = new Map<string, UnifiedTask[]>();
  for (const k of seed) byKey.set(k, []);
  for (const t of visible) {
    for (const k of keys(t)) {
      let list = byKey.get(k);
      if (!list) { list = []; byKey.set(k, list); }
      list.push(t);
    }
  }
  const named = [...byKey.keys()].filter((k) => !fallbackLast.includes(k));
  const ordered = seed.length > 0 ? [...seed, ...named.filter((k) => !seed.includes(k)).sort((a, b) => a.localeCompare(b))]
    : named.sort((a, b) => a.localeCompare(b));
  const ids = [...ordered, ...fallbackLast.filter((k) => byKey.has(k))];
  return ids.map((listId) => ({ listId, cards: (byKey.get(listId) ?? []).sort(sortCards) }));
};

export const boardGroupsBy = (
  tasks: readonly UnifiedTask[],
  filter: ShellFilter,
  opts: GroupOptions,
): BoardGroup[] => {
  const visible = tasks.filter((t) => matchesShellFilter(t, filter));
  let groups: BoardGroup[];
  if (opts.groupBy === 'status') {
    groups = boardGroupsWithExtras(tasks, filter, opts.columnOrder);
  } else if (opts.groupBy === 'label') {
    const lists = opts.labelLists;
    const open = visible.filter((t) => !isClosed(t));
    const closed = visible.filter(isClosed);
    groups = [
      { listId: OPEN_COLUMN, cards: open.filter((t) => !lists.some((l) => t.labels.includes(l))).sort(sortCards) },
      ...lists.map((l) => ({ listId: `${LABEL_PREFIX}${l}`, cards: open.filter((t) => t.labels.includes(l)).sort(sortCards) })),
      { listId: CLOSED_COLUMN, cards: closed.sort(sortCards) },
    ];
  } else if (opts.groupBy === 'assignee') {
    groups = bucket(visible, (t) => [t.assignee ?? NO_ASSIGNEE], [], [NO_ASSIGNEE]);
  } else {
    groups = bucket(visible, (t) => [t.milestone ?? NO_MILESTONE], [], [NO_MILESTONE]);
  }
  if (opts.groupBy !== 'status' && opts.groupBy !== 'label') groups = applyColumnOrder(groups, opts.columnOrder);
  return groups.filter((g) => {
    if (opts.hideEmpty && g.cards.length === 0) return false;
    if (opts.hideClosed && (g.listId === 'done' || g.listId === CLOSED_COLUMN)) return false;
    return true;
  });
};

// Write for dropping a card on a column. Status mode keeps the existing
// listId move; label mode maps to label add/remove and close/reopen.
export type MovePatch = {
  listId?: string;
  fromListId?: string;
  addLabels?: string[];
  removeLabels?: string[];
};

export const labelMovePatch = (task: UnifiedTask, toColumn: string, labelLists: readonly string[]): MovePatch => {
  const closed = isClosed(task);
  const reopenList = task.adapterId === 'local' ? 'todo' : 'open';
  const patch: MovePatch = {};
  if (toColumn === CLOSED_COLUMN) {
    if (!closed) { patch.listId = 'done'; patch.fromListId = task.listId; }
    return patch;
  }
  if (closed) { patch.listId = reopenList; patch.fromListId = task.listId === 'done' ? 'done' : task.listId; }
  const remove = labelLists.filter((l) => task.labels.includes(l) && `${LABEL_PREFIX}${l}` !== toColumn);
  if (remove.length > 0) patch.removeLabels = remove;
  if (toColumn.startsWith(LABEL_PREFIX)) {
    const label = toColumn.slice(LABEL_PREFIX.length);
    if (!task.labels.includes(label)) patch.addLabels = [label];
  }
  return patch;
};

// Human title for a non-status column id.
export const groupTitle = (listId: string): string | null => {
  if (listId === OPEN_COLUMN) return 'Open';
  if (listId === CLOSED_COLUMN) return 'Closed';
  if (listId === NO_ASSIGNEE) return 'Unassigned';
  if (listId === NO_MILESTONE) return 'No milestone';
  if (listId.startsWith(LABEL_PREFIX)) return listId.slice(LABEL_PREFIX.length);
  return null;
};

// Column title for the active grouping: assignee / milestone names are shown
// verbatim; everything else falls back to the caller's list title.
export const columnTitle = (listId: string, groupBy: GroupBy, fallback: (id: string) => string): string => {
  const special = groupTitle(listId);
  if (special !== null) return special;
  return groupBy === 'assignee' || groupBy === 'milestone' ? listId : fallback(listId);
};

// Toolbar/create sources: configured adapters whose capabilities.allow
// create (older cached rows without the flag keep creating). local is
// always offered — the service never reports it unconfigured.
export const createSources = (
  adapters: readonly { id: string; configured?: boolean; capabilities?: { create: boolean } }[],
): { id: string; label: string }[] =>
  adapters
    .filter((a) => a.id === 'local' || (a.configured !== false && a.capabilities?.create !== false))
    .map((a) => ({ id: a.id, label: a.id.charAt(0).toUpperCase() + a.id.slice(1) }));

// Delete confirmation is capability-gated and fails closed while adapter
// metadata is unavailable. Copy varies only for local-vs-remote semantics;
// platform support itself never appears as a UI-side adapter branch.
export const deleteConfirm = (
  task: UnifiedTask,
  capabilities: AdapterCapabilities | undefined,
): { title: string; body: string } | null => {
  if (!capabilities?.delete) return null;
  if (task.adapterId === 'local') {
    return { title: 'Delete task?', body: 'Delete this task locally? The board entry disappears; nothing is sent anywhere.' };
  }
  return { title: 'Delete issue?', body: `Delete ${task.externalId} in ${sourceLabel(task.adapterId)} permanently? This cannot be undone.` };
};

// Capabilities of the adapter a task belongs to (undefined = unknown — the
// UI keeps rendering without the capability-gated blocks).
export const capabilitiesOf = (
  adapters: readonly { id: string; capabilities?: AdapterCapabilities }[] | null,
  adapterId: string,
): AdapterCapabilities | undefined =>
  adapters?.find((a) => a.id === adapterId)?.capabilities;
