// UI prefs over the storage seam (kanban prefs pattern): view mode and
// filters survive reload (design G3).
import type { StorageClient } from '../adapters/types.ts';
import type { AdapterId } from '../domain/task.ts';

export const PREFS_KEY = 'prefs';

export type ViewMode = 'table' | 'kanban';

export type GroupBy = 'status' | 'label' | 'assignee' | 'milestone';
export type StateFilter = 'all' | 'open' | 'closed';

export type Prefs = {
  viewMode: ViewMode;
  query: string;
  adapter: 'all' | AdapterId;
  /** Project filter key ('all' | '__none__' | projectRef) — survives reload (review #6). */
  project: string;
  /** Collapsed kanban column listIds (review UX round 2). */
  collapsed: string[];
  /** Kanban column order: dragged columns lead, unknown lists follow (review UX round 2). */
  columnOrder: string[];
  /** Board grouping (GitHub Projects style). */
  groupBy: GroupBy;
  /** Label-backed columns the user added (GitLab "Add list"). */
  labelLists: string[];
  /** 'all' | '__none__' (assignee) | value. */
  assignee: string;
  label: string;
  author: string;
  state: StateFilter;
  hideEmpty: boolean;
  hideClosed: boolean;
  /** Server-side scope: assigned-to-me only (default true, preserves the
   * old discovery behaviour) vs everything the token can see. */
  mineOnly: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  viewMode: 'table', query: '', adapter: 'all', project: 'all', collapsed: [], columnOrder: [],
  groupBy: 'status', labelLists: [], assignee: 'all', label: 'all', author: 'all', state: 'all',
  hideEmpty: false, hideClosed: false, mineOnly: true,
};

const VIEW_MODES: ViewMode[] = ['table', 'kanban'];
const GROUPS: GroupBy[] = ['status', 'label', 'assignee', 'milestone'];
const STATES: StateFilter[] = ['all', 'open', 'closed'];

const str = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length <= max ? value : null;

export const parsePrefs = (value: unknown): Prefs => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PREFS };
  const r = value as Record<string, unknown>;
  const viewMode = VIEW_MODES.includes(r.viewMode as ViewMode) ? (r.viewMode as ViewMode) : DEFAULT_PREFS.viewMode;
  const adapter = str(r.adapter, 32);
  const collapsed = Array.isArray(r.collapsed)
    ? [...new Set(r.collapsed.filter((c): c is string => typeof c === 'string' && c.length > 0))].slice(0, 32)
    : DEFAULT_PREFS.collapsed;
  const columnOrder = Array.isArray(r.columnOrder)
    ? [...new Set(r.columnOrder.filter((c): c is string => typeof c === 'string' && c.length > 0))].slice(0, 64)
    : DEFAULT_PREFS.columnOrder;
  return {
    viewMode,
    query: str(r.query, 200) ?? '',
    adapter: adapter && adapter !== 'all' ? (adapter as Prefs['adapter']) : 'all',
    project: str(r.project, 256) ?? 'all',
    collapsed,
    columnOrder,
    groupBy: GROUPS.includes(r.groupBy as GroupBy) ? (r.groupBy as GroupBy) : 'status',
    labelLists: Array.isArray(r.labelLists)
      ? [...new Set(r.labelLists.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= 100))].slice(0, 32)
      : [],
    assignee: str(r.assignee, 128) ?? 'all',
    label: str(r.label, 128) ?? 'all',
    author: str(r.author, 128) ?? 'all',
    state: STATES.includes(r.state as StateFilter) ? (r.state as StateFilter) : 'all',
    hideEmpty: r.hideEmpty === true,
    hideClosed: r.hideClosed === true,
    mineOnly: r.mineOnly !== false,
  };
};

export const loadPrefs = async (storage: StorageClient): Promise<Prefs> =>
  parsePrefs(await storage.get(PREFS_KEY));

export const savePrefs = (storage: StorageClient, prefs: Prefs): Promise<void> =>
  storage.set(PREFS_KEY, { ...prefs });
