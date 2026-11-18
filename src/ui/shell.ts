// Shell: table ⇄ board over one task set. The toolbar is mounted once and
// updated in place (typed search, open dropdowns survive refreshes); only
// the view region is repainted, and only when the data actually changed.
// The last-good list is cached in host.storage and painted before the first
// fetch, so the page never opens empty. All data comes from the service;
// the panel never touches a token.
import type { HostClient, JsonValue } from '@openchamber/sdk';
import { mountButton, mountSearchField, mountSelect, mountTabs } from '@openchamber/sdk/ui';
import { clear, debounce, el, Scope, slot } from './dom.ts';
import { injectStyles, SMALL_PX } from './styles.ts';
import { renderTable } from './table.ts';
import { renderBoard } from './board.ts';
import { openDetail } from './detail.ts';
import { closeAllModals, openModal } from './modal.ts';
import type { MenuItem } from '@openchamber/sdk/ui';
import { listTitle, repoName, timeAgo } from './present.ts';
import {
  boardGroupsBy, boardGroupsWithExtras, capabilitiesOf, CLOSED_COLUMN, columnTitle, createSources, filterOptions, groupingWritable, isClosed,
  labelMovePatch, LABEL_PREFIX, NONE, OPEN_COLUMN, railCounts, tableOrder, type ShellFilter,
} from './shellState.ts';
import { openCreate } from './create.ts';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from '../store/prefs.ts';
import { buildCache, loadListCache, saveListCache, type CachedAdapter, type CachedHealth } from '../store/listCache.ts';
import { reportWorkspace } from '../host/workspace.ts';
import type { AdapterOptions } from '../adapters/types.ts';
import type { UnifiedTask } from '../domain/task.ts';
import { createSvc, ServiceError } from '../host/serviceClient.ts';

type ListReply = { tasks: UnifiedTask[]; health: CachedHealth[]; cached: boolean; notice?: string | null; scope?: { discovery: boolean; mineOnly: boolean } };

const asStorage = (host: Pick<HostClient, 'storage'>) => ({
  keys: () => host.storage.keys(),
  get: async (key: string) => await host.storage.get(key),
  set: (key: string, value: unknown) => host.storage.set(key, value as JsonValue),
  delete: (key: string) => host.storage.delete(key),
});

export type ShellCallbacks = {
  onStartAgent(task: UnifiedTask, projectId: string | null): void;
  onOpenChat(task: UnifiedTask): void;
  /** Non-blocking single notification (toast) — for one-time hints. */
  notify(message: string): void;
  onOpenUrl(url: string): void;
  /** The live task list after every successful refresh (linkage feed). */
  onRefreshed?: (tasks: readonly UnifiedTask[]) => void;
};

// Start Agent with no checkout: ask for a project root — no auto-clone.
export const promptProjectRoot = (
  projects: ReadonlyArray<{ directory: string }>,
  onPick: (directory: string) => void,
): void => {
  const modal = openModal({ title: 'Pick a project root' });
  modal.body.append(el('p', 'tk-muted', 'This task has no local checkout. Choose where the agent should work — nothing will be cloned.'));
  const group = el('div');
  group.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  for (const project of projects) {
    const label = el('label', 'tk-radio');
    const input = el('input');
    input.type = 'radio';
    input.name = 'tk-root';
    input.value = project.directory;
    label.append(input, el('span', '', project.directory));
    group.append(label);
  }
  if (projects.length === 0) group.append(el('div', 'tk-muted', 'No projects are registered in OpenChamber yet.'));
  modal.body.append(group);
  const startSlot = slot();
  const cancelSlot = slot();
  modal.foot.append(cancelSlot, startSlot);
  modal.scope.keep(mountButton(cancelSlot, { label: 'Cancel', variant: 'ghost', onClick: () => modal.close() }));
  const start = modal.scope.keep(mountButton(startSlot, {
    label: 'Start agent',
    disabled: true,
    onClick: () => {
      const picked = (modal.body.querySelector('input[name="tk-root"]:checked') as HTMLInputElement | null)?.value;
      modal.close();
      if (picked) onPick(picked);
    },
  }));
  group.addEventListener('change', () => start.update({ disabled: false }));
};

export const mountShell = (
  host: Pick<HostClient, 'storage' | 'serviceRequest' | 'onProjects'>,
  root: HTMLElement,
  cb: ShellCallbacks,
): { refresh: () => Promise<void>; dispose: () => void } => {
  injectStyles();
  const svc = createSvc(host);
  const storage = asStorage(host);

  const state = {
    prefs: { ...DEFAULT_PREFS } as Prefs,
    tasks: [] as UnifiedTask[],
    health: [] as CachedHealth[],
    adapters: null as CachedAdapter[] | null,
    agentProjects: [] as { id: string; directory: string }[],
    notice: null as string | null,
    /** Scope the last /tasks reply was built with (null until first refresh). */
    scope: null as { discovery: boolean; mineOnly: boolean } | null,
    /** true once a live reply arrived (cached rows have no descriptions). */
    fresh: false,
    loading: true,
    error: null as string | null,
    lastOk: 0,
    narrow: false,
  };
  let disposed = false;
  const toasted = new Set<string>();
  const dismissed = new Set<string>();
  const bar = new Scope();
  const viewScope = new Scope();

  const shell = el('div', 'tk');
  const fbar = el('div', 'tk-fbar');
  const rowA = el('div', 'tk-fbar-row');
  const rowB = el('div', 'tk-fbar-row');
  const rowC = el('div', 'tk-fbar-row');
  fbar.append(rowA, rowB, rowC);
  const notes = el('div');
  const view = el('div', 'tk-view');
  shell.append(fbar, notes, view);
  root.append(shell);

  // ---- toolbar (mounted once) ---------------------------------------
  const searchSlot = slot('tk-search');
  const statusNode = el('span', 'tk-status');
  const statusDot = el('span', 'tk-dot');
  const statusText = el('span');
  statusNode.append(statusDot, statusText);
  const refreshSlot = slot();
  const newTaskSlot = slot();
  rowA.append(searchSlot, statusNode, newTaskSlot, refreshSlot);
  const tabsSlot = slot();
  const adapterSlot = slot('tk-pill');
  const projectSlot = slot('tk-pill');
  rowB.append(tabsSlot, adapterSlot, projectSlot);
  const assigneeSlot = slot('tk-pill');
  const labelSlot = slot('tk-pill');
  const authorSlot = slot('tk-pill');
  const stateSlot = slot('tk-pill');
  const groupSlot = slot('tk-pill');
  const addListSlot = slot('tk-pill');
  const hideEmptySlot = slot();
  const hideClosedSlot = slot();
  const mineSlot = slot();
  rowC.append(assigneeSlot, labelSlot, authorSlot, stateSlot, groupSlot, addListSlot, hideEmptySlot, hideClosedSlot, mineSlot);

  const persist = debounce(() => { void savePrefs(storage, state.prefs); }, 300);
  const filter = (): ShellFilter => ({
    adapter: state.prefs.adapter,
    project: state.prefs.project,
    query: state.prefs.query,
    assignee: state.prefs.assignee,
    label: state.prefs.label,
    author: state.prefs.author,
    state: state.prefs.state,
  });
  const setPref = (apply: () => void): void => { apply(); persist(); paint(); syncBar(); };

  const search = bar.keep(mountSearchField(searchSlot, {
    value: state.prefs.query,
    placeholder: 'Search tasks…',
    onChange: (value) => { state.prefs.query = value; persist(); paint(); },
  }));
  const refreshBtn = bar.keep(mountButton(refreshSlot, { label: 'Refresh', variant: 'ghost', size: 'sm', onClick: () => { void refresh(); } }));
  const newTaskBtn = bar.keep(mountButton(newTaskSlot, {
    label: 'New task', variant: 'secondary', size: 'sm',
    onClick: () => createIn(null),
  }));
  const tabs = bar.keep(mountTabs(tabsSlot, {
    items: [{ id: 'table', label: 'List' }, { id: 'kanban', label: 'Board' }],
    activeId: state.prefs.viewMode,
    onChange: (id) => { state.prefs.viewMode = id === 'kanban' ? 'kanban' : 'table'; persist(); paint(); syncBar(); },
    trackBackground: true,
  }));
  const adapterSelect = bar.keep(mountSelect(adapterSlot, {
    value: 'all',
    options: [{ id: 'all', label: 'All sources' }],
    onChange: (id) => { state.prefs.adapter = id as Prefs['adapter']; persist(); paint(); syncBar(); },
  }));
  const projectSelect = bar.keep(mountSelect(projectSlot, {
    value: 'all',
    options: [{ id: 'all', label: 'All projects' }],
    searchable: true,
    searchPlaceholder: 'Find a project…',
    onChange: (id) => { state.prefs.project = id; persist(); paint(); syncBar(); },
  }));

  const filterSelect = (slotNode: HTMLElement, label: string, pick: (id: string) => void) =>
    bar.keep(mountSelect(slotNode, { label: undefined, value: 'all', options: [{ id: 'all', label }], searchable: true, searchPlaceholder: 'Filter…', onChange: pick }));
  const assigneeSelect = filterSelect(assigneeSlot, 'Any assignee', (id) => setPref(() => { state.prefs.assignee = id; }));
  const labelSelect = filterSelect(labelSlot, 'Any label', (id) => setPref(() => { state.prefs.label = id; }));
  const authorSelect = filterSelect(authorSlot, 'Any author', (id) => setPref(() => { state.prefs.author = id; }));
  const stateSelect = bar.keep(mountSelect(stateSlot, {
    value: 'all',
    options: [{ id: 'all', label: 'Open & closed' }, { id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }],
    onChange: (id) => setPref(() => { state.prefs.state = id === 'open' || id === 'closed' ? id : 'all'; }),
  }));
  const GROUPS: { id: Prefs['groupBy']; label: string }[] = [
    { id: 'status', label: 'Group: Status' }, { id: 'label', label: 'Group: Label' },
    { id: 'assignee', label: 'Group: Assignee' }, { id: 'milestone', label: 'Group: Milestone' },
  ];
  const groupSelect = bar.keep(mountSelect(groupSlot, {
    value: 'status',
    options: GROUPS,
    onChange: (id) => setPref(() => { state.prefs.groupBy = GROUPS.find((g) => g.id === id)?.id ?? 'status'; }),
  }));
  const addListSelect = bar.keep(mountSelect(addListSlot, {
    value: null,
    options: [],
    placeholder: 'Add list…',
    searchable: true,
    searchPlaceholder: 'Find a label…',
    onChange: (id) => setPref(() => { if (!state.prefs.labelLists.includes(id)) state.prefs.labelLists = [...state.prefs.labelLists, id]; }),
  }));
  const hideEmptyBtn = bar.keep(mountButton(hideEmptySlot, {
    label: 'Hide empty', variant: 'ghost', size: 'sm',
    onClick: () => setPref(() => { state.prefs.hideEmpty = !state.prefs.hideEmpty; }),
  }));
  const hideClosedBtn = bar.keep(mountButton(hideClosedSlot, {
    label: 'Hide closed', variant: 'ghost', size: 'sm',
    onClick: () => setPref(() => { state.prefs.hideClosed = !state.prefs.hideClosed; }),
  }));
  // Server-side scope: assigned-to-me vs everything. Visible once the first
  // /tasks reply reports its scope — in discovery mode this is the answer
  // to "why is GitLab empty with a bot token".
  const mineBtn = bar.keep(mountButton(mineSlot, {
    label: 'Mine only', variant: 'secondary', size: 'sm',
    onClick: () => {
      state.prefs.mineOnly = !state.prefs.mineOnly;
      persist();
      syncBar();
      void refresh();
    },
  }));

  const configuredIds = (): Set<string> =>
    new Set((state.adapters ?? [{ id: 'local' }]).filter((a) => a.configured !== false).map((a) => a.id));

  const syncBar = (): void => {
    const configured = configuredIds();
    const inTasks = new Set<string>(state.tasks.map((t) => t.adapterId));
    const adapterIds = (state.adapters ?? []).map((a) => a.id).filter((id) => id === 'local' || configured.has(id) || inTasks.has(id));
    const sourceLabel = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
    adapterSelect.update({
      value: state.prefs.adapter,
      options: [{ id: 'all', label: 'All sources' }, ...adapterIds.map((id) => ({ id, label: sourceLabel(id) }))],
    });
    const projects = [...new Set(state.tasks.map((t) => t.projectRef).filter((p): p is string => !!p))].sort();
    if (state.prefs.project !== 'all' && !projects.includes(state.prefs.project) && state.prefs.project !== '__none__') projects.push(state.prefs.project);
    projectSelect.update({
      value: state.prefs.project,
      options: [{ id: 'all', label: 'All projects' }, ...projects.map((id) => ({ id, label: repoName(id) || id, hint: id.split(':')[0] }))],
    });
    const opts = filterOptions(state.tasks);
    const withCurrent = (list: string[], current: string): string[] =>
      current !== 'all' && current !== NONE && !list.includes(current) ? [...list, current] : list;
    assigneeSelect.update({
      value: state.prefs.assignee,
      options: [{ id: 'all', label: 'Any assignee' }, { id: NONE, label: 'Unassigned' }, ...withCurrent(opts.assignees, state.prefs.assignee).map((id) => ({ id, label: `@${id}` }))],
    });
    labelSelect.update({
      value: state.prefs.label,
      options: [{ id: 'all', label: 'Any label' }, ...withCurrent(opts.labels, state.prefs.label).map((id) => ({ id, label: id }))],
    });
    authorSelect.update({
      value: state.prefs.author,
      options: [{ id: 'all', label: 'Any author' }, ...withCurrent(opts.authors, state.prefs.author).map((id) => ({ id, label: `@${id}` }))],
    });
    stateSelect.update({ value: state.prefs.state });
    const board = state.prefs.viewMode === 'kanban';
    groupSlot.hidden = !board;
    hideEmptySlot.hidden = !board;
    hideClosedSlot.hidden = !board;
    addListSlot.hidden = !(board && state.prefs.groupBy === 'label');
    groupSelect.update({ value: state.prefs.groupBy });
    addListSelect.update({ value: null, options: opts.labels.filter((l) => !state.prefs.labelLists.includes(l)).map((id) => ({ id, label: id })) });
    hideEmptyBtn.update({ variant: state.prefs.hideEmpty ? 'secondary' : 'ghost' });
    hideClosedBtn.update({ variant: state.prefs.hideClosed ? 'secondary' : 'ghost' });
    mineSlot.hidden = state.scope === null;
    mineBtn.update({
      label: state.prefs.mineOnly ? 'Mine only' : 'Show all',
      variant: state.prefs.mineOnly ? 'secondary' : 'ghost',
    });
    tabs.update({ activeId: state.prefs.viewMode });
    const counts = railCounts(state.tasks);
    tabs.update({ items: [{ id: 'table', label: 'List', count: counts.total }, { id: 'kanban', label: 'Board' }] });
    refreshBtn.update({ loading: state.loading, disabled: state.loading });
    statusDot.dataset.tone = state.error ? 'error' : state.loading ? 'busy' : 'ok';
    const scopeSuffix = !state.error && !state.loading && state.scope?.mineOnly ? ' · assigned to you' : '';
    statusText.textContent = state.error
      ? 'Offline — showing saved list'
      : state.loading
        ? 'Updating…'
        : state.lastOk ? `Updated ${timeAgo(state.lastOk)}${scopeSuffix}` : '';
  };

  // ---- notes (health / notice / errors) ------------------------------
  const paintNotes = (): void => {
    clear(notes);
    for (const h of state.health) {
      if (h.ok || h.kind !== 'credentials' || toasted.has(h.id)) continue;
      toasted.add(h.id);
      cb.notify(h.message ?? `${h.label} is not configured.`);
    }
    const bad = state.health.filter((h) => !h.ok && h.kind !== 'credentials');
    const text = state.error ?? state.notice ?? bad.map((h) => `${h.label}: ${h.message ?? 'unavailable'}`).join(' · ');
    if (!text || dismissed.has(text)) return;
    const note = el('div', 'tk-note');
    note.dataset.tone = state.error ? 'error' : 'warning';
    const close = el('button', 'tk-note-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', () => { dismissed.add(text); note.remove(); });
    note.append(el('span', '', text), close);
    notes.append(note);
  };

  // ---- sends ----------------------------------------------------------
  const lastIntended = new Map<string, { path: string; body: Record<string, unknown> }>();
  const sendPatch = async (task: UnifiedTask, body: Record<string, unknown>): Promise<void> => {
    const path = `/tasks/${encodeURIComponent(task.adapterId)}/${encodeURIComponent(task.externalId)}`;
    lastIntended.set(task.id, { path, body });
    try {
      await svc('PATCH', path, body);
      if (lastIntended.get(task.id)?.path === path) lastIntended.delete(task.id);
    } catch (err) {
      state.error = `Sync failed: ${err instanceof ServiceError ? err.message : String(err)}`;
      paintNotes();
    }
    void refresh();
  };
  const move = (task: UnifiedTask, to: string, from: string): Promise<void> => sendPatch(task, { listId: to, fromListId: from });
  const retry = async (task: UnifiedTask): Promise<void> => {
    const pending = lastIntended.get(task.id);
    if (pending) await sendPatch(task, pending.body);
    else await refresh();
  };

  // Edit-dialog options, session-cached per (adapter, project). A failed
  // fetch degrades only the option selects, but is never silent: toast once
  // per project and retry on the next dialog open.
  const optionsCache = new Map<string, AdapterOptions>();
  const optionsNotified = new Set<string>();
  const optionsLoader = async (task: UnifiedTask): Promise<AdapterOptions | null> => {
    if (!task.projectRef) return null;
    const key = `${task.adapterId}:${task.projectRef}`;
    const hit = optionsCache.get(key);
    if (hit) return hit;
    try {
      const value = await svc<AdapterOptions>('GET', `/options?adapter=${encodeURIComponent(task.adapterId)}&project=${encodeURIComponent(task.projectRef)}`);
      optionsCache.set(key, value);
      optionsNotified.delete(key);
      return value;
    } catch (err) {
      if (!optionsNotified.has(key)) {
        optionsNotified.add(key);
        cb.notify(`Could not load edit options: ${err instanceof ServiceError ? err.message : String(err)}`);
      }
      return null;
    }
  };

  // True delete on the source: the card leaves the board immediately on
  // success (optimistic), a failure keeps it and toasts the reason.
  const sendDestroy = async (task: UnifiedTask): Promise<void> => {
    try {
      await svc('POST', `/tasks/${encodeURIComponent(task.adapterId)}/${encodeURIComponent(task.externalId)}/destroy`, {});
      state.tasks = state.tasks.filter((t) => t.id !== task.id);
      cb.notify('Deleted');
      paint(true);
    } catch (err) {
      cb.notify(`Delete failed: ${err instanceof ServiceError ? err.message : String(err)}`);
    }
    void refresh();
  };

  const visibleLists = (): string[] => boardGroupsWithExtras(state.tasks, filter(), state.prefs.columnOrder).map((g) => g.listId);

  const copyLink = (task: UnifiedTask): void => {
    const url = task.url;
    if (!url) return;
    const clip = navigator.clipboard;
    if (clip) void clip.writeText(url).then(() => cb.notify('Link copied'), () => cb.notify(url));
    else cb.notify(url);
  };

  const menuItems = (task: UnifiedTask): MenuItem[] => {
    const items: MenuItem[] = [{ id: isClosed(task) ? 'reopen' : 'close', label: isClosed(task) ? 'Reopen' : 'Close' }];
    if (task.url) items.push({ id: 'open', label: 'Open in browser' }, { id: 'copy', label: 'Copy link' });
    items.push({ separator: true }, { id: 'agent', label: task.sessionId ? 'Restart agent' : 'Start agent' });
    if (task.sessionId) items.push({ id: 'chat', label: 'Open chat' });
    return items;
  };
  const onMenu = (task: UnifiedTask, id: string): void => {
    if (id === 'close') void sendPatch(task, labelMovePatch(task, CLOSED_COLUMN, []));
    else if (id === 'reopen') void sendPatch(task, labelMovePatch(task, OPEN_COLUMN, []));
    else if (id === 'open' && task.url) cb.onOpenUrl(task.url);
    else if (id === 'copy') copyLink(task);
    else if (id === 'agent') handleStartAgent(task);
    else if (id === 'chat') cb.onOpenChat(task);
  };

  const createIn = (columnId: string | null): void => {
    const groupBy = state.prefs.groupBy;
    const adapters = createSources(state.adapters ?? [{ id: 'local' }]);
    const projectsByAdapter: Record<string, string[]> = {};
    // Configured repos/workspace remotes keep Create usable even when the
    // current source has no visible tasks (empty board or narrow filters).
    for (const adapter of state.adapters ?? []) {
      for (const ref of adapter.projects ?? []) (projectsByAdapter[adapter.id] ??= []).push(ref);
    }
    for (const t of state.tasks) {
      if (!t.projectRef) continue;
      const list = (projectsByAdapter[t.adapterId] ??= []);
      if (!list.includes(t.projectRef)) list.push(t.projectRef);
    }
    const sourceNow = state.prefs.adapter !== 'all' ? state.prefs.adapter : (adapters.find((a) => (projectsByAdapter[a.id] ?? []).length > 0)?.id ?? null);
    const projectNow = state.prefs.project !== 'all' && state.prefs.project !== NONE ? state.prefs.project : null;
    openCreate({
      columnTitle: columnId === null ? 'New task' : columnTitle(columnId, groupBy, listTitle),
      adapters,
      projectsByAdapter,
      defaults: { adapterId: sourceNow, projectRef: projectNow },
      onSubmit: async (form) => {
        const body: Record<string, unknown> = { adapterId: form.adapterId, projectRef: form.projectRef, title: form.title, description: form.description };
        if (columnId !== null && groupBy === 'label' && columnId.startsWith(LABEL_PREFIX)) body.labels = [columnId.slice(LABEL_PREFIX.length)];
        else if (columnId !== null && groupBy === 'status') body.listId = columnId;
        try {
          await svc('POST', '/tasks', body);
        } catch (err) {
          throw new Error(err instanceof ServiceError ? err.message : String(err));
        }
        void refresh();
      },
    });
  };

  const handleStartAgent = (task: UnifiedTask): void => {
    const repo = task.projectRef ? repoName(task.projectRef) : null;
    const match = repo ? state.agentProjects.find((p) => p.directory.split('/').pop() === repo) : undefined;
    if (match) { cb.onStartAgent(task, match.id); return; }
    promptProjectRoot(state.agentProjects, (directory) => {
      cb.onStartAgent(task, state.agentProjects.find((p) => p.directory === directory)?.id ?? null);
    });
  };

  const openTask = (task: UnifiedTask): void => {
    openDetail(task, visibleLists(), {
      onSave: (t, patch) => { void sendPatch(t, { ...patch }); },
      onMove: (t, to, from) => void move(t, to, from),
      onStartAgent: handleStartAgent,
      onOpenChat: cb.onOpenChat,
      onOpenUrl: cb.onOpenUrl,
      onDelete: (t) => { void sendDestroy(t); },
      onOptions: (t) => optionsLoader(t),
    }, { stale: !state.fresh, capabilities: capabilitiesOf(state.adapters, task.adapterId) });
  };

  // ---- view -----------------------------------------------------------
  let paintedKey = '';
  const paint = (force = false): void => {
    const f = filter();
    const p = state.prefs;
    const key = JSON.stringify([p.viewMode, state.narrow, f, p.collapsed, p.columnOrder, p.groupBy, p.labelLists, p.hideEmpty, p.hideClosed, p.mineOnly, state.scope, state.tasks]);
    if (!force && key === paintedKey) return;
    paintedKey = key;
    const top = view.scrollTop;
    const columns = view.querySelector('.tk-columns');
    const left = columns ? columns.scrollLeft : 0;
    view.dataset.view = state.prefs.viewMode;
    viewScope.reset();
    clear(view);
    if (state.tasks.length === 0 && !state.loading && !state.error) {
      const empty = el('div', 'tk-empty');
      empty.append(el('b', '', 'No tasks yet'), el('span', '', 'Issues assigned to you and tasks from workspace repos show up here.'));
      view.append(empty);
      return;
    }
    if (state.tasks.length === 0 && state.loading) {
      view.append(el('div', 'tk-empty', 'Loading tasks…'));
      return;
    }
    if (state.prefs.viewMode === 'table') {
      view.append(renderTable(tableOrder(state.tasks, f), { onOpen: openTask, onRetry: (t) => void retry(t) }, state.narrow));
      view.scrollTop = top;
      return;
    }
    const collapsed = new Set(state.prefs.collapsed);
    const prefs = state.prefs;
    const groupOpts = {
      groupBy: prefs.groupBy, labelLists: prefs.labelLists, columnOrder: prefs.columnOrder,
      hideEmpty: prefs.hideEmpty, hideClosed: prefs.hideClosed,
    };
    const writable = groupingWritable(prefs.groupBy);
    const columnIds = (): string[] => boardGroupsBy(state.tasks, f, groupOpts).map((g) => g.listId);
    const board = renderBoard(state.tasks, boardGroupsBy(state.tasks, f, groupOpts), {
      onOpen: openTask,
      onMove: (t, to, from, rank) => {
        if (prefs.groupBy === 'label') {
          const patch = labelMovePatch(t, to, prefs.labelLists);
          if (Object.keys(patch).length > 0) void sendPatch(t, { ...patch });
        } else void move(t, to, from);
        void svc('POST', '/link', { adapterId: t.adapterId, externalId: t.externalId, patch: { rank } }).catch(() => undefined);
      },
      onToggleCollapse: (listId) => {
        prefs.collapsed = prefs.collapsed.includes(listId)
          ? prefs.collapsed.filter((id) => id !== listId)
          : [...prefs.collapsed, listId];
        persist();
        paint();
      },
      onMoveColumn: (dragged, target) => {
        const order = columnIds();
        const from = order.indexOf(dragged);
        if (from === -1) return;
        order.splice(from, 1);
        const to = order.indexOf(target);
        order.splice(to < 0 ? order.length : to, 0, dragged);
        prefs.columnOrder = order;
        persist();
        paint();
      },
    }, collapsed, {
      writable,
      title: (id) => columnTitle(id, prefs.groupBy, listTitle),
      canAdd: (id) => writable && id !== CLOSED_COLUMN && id !== 'done',
      canRemove: (id) => prefs.groupBy === 'label' && id.startsWith(LABEL_PREFIX),
      onAdd: createIn,
      onRemove: (id) => setPref(() => { prefs.labelLists = prefs.labelLists.filter((l) => `${LABEL_PREFIX}${l}` !== id); }),
      scope: viewScope,
      menuItems,
      onMenu,
    });
    view.append(board);
    board.scrollLeft = left;
  };

  const renderAll = (): void => {
    syncBar();
    paintNotes();
    paint();
    const counts = railCounts(state.tasks);
    document.title = `Tasks Hub (${counts.open}/${counts.total})`;
  };

  // ---- data -----------------------------------------------------------
  let inFlight: Promise<void> | null = null;
  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (inFlight) return inFlight;
    state.loading = true;
    syncBar();
    inFlight = (async () => {
      const query = state.prefs.mineOnly ? '?assignee=me' : '?assignee=all';
      const [list, registry] = await Promise.allSettled([
        svc<ListReply>('GET', `/tasks${query}`),
        svc<{ adapters: CachedAdapter[] }>('GET', '/adapters'),
      ]);
      if (list.status === 'fulfilled') {
        state.tasks = list.value.tasks;
        state.health = list.value.health;
        state.notice = list.value.notice ?? null;
        state.scope = list.value.scope ?? null;
        state.fresh = true;
        state.error = null;
        state.lastOk = Date.now();
        // Feed the linkage controller: without sync() its watcher never
        // sees a snapshot (pre-publish review).
        cb.onRefreshed?.(state.tasks);
      } else {
        const err = list.reason;
        state.error = `Tasks service error: ${err instanceof ServiceError ? err.message : String(err)}`;
      }
      if (registry.status === 'fulfilled') {
        state.adapters = registry.value.adapters;
        if (state.prefs.adapter !== 'all' && !configuredIds().has(state.prefs.adapter)) {
          state.prefs.adapter = 'all';
          persist();
        }
      }
      if (list.status === 'fulfilled') {
        void saveListCache(storage, buildCache({ tasks: state.tasks, health: state.health, adapters: state.adapters }, Date.now())).catch(() => undefined);
      }
    })().finally(() => {
      state.loading = false;
      inFlight = null;
      if (!disposed) renderAll();
    });
    return inFlight;
  };

  void (async () => {
    const [prefs, cache] = await Promise.all([loadPrefs(storage), loadListCache(storage).catch(() => null)]);
    state.prefs = prefs;
    search.update({ value: prefs.query });
    if (cache && cache.tasks.length > 0) {
      state.tasks = cache.tasks;
      state.health = cache.health;
      state.adapters = cache.adapters;
      state.lastOk = cache.savedAt;
    }
    renderAll();
    await refresh();
  })();

  const stopProjects = host.onProjects((snapshot: { state: string; projects: ReadonlyArray<{ id: string; directory: string }> }) => {
    state.agentProjects = snapshot.projects.map((p) => ({ id: p.id, directory: p.directory }));
    void reportWorkspace(svc, state.agentProjects.map((p) => p.directory)).catch(() => undefined);
  });
  void stopProjects.then((stop) => { if (disposed) stop(); }, () => undefined);

  // Layout: measured width → data-size (list rows stack, columns shrink).
  const measure = (): void => {
    const width = root.clientWidth;
    const size = width < SMALL_PX ? 's' : 'l';
    shell.dataset.size = size;
    const narrow = width < 640;
    if (narrow !== state.narrow) { state.narrow = narrow; paint(); }
  };
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  measure();

  const poll = setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
  const onVisible = (): void => { if (!document.hidden) void refresh(); };
  document.addEventListener('visibilitychange', onVisible);

  return {
    refresh,
    dispose: () => {
      disposed = true;
      clearInterval(poll);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      void stopProjects.then((stop) => stop(), () => undefined);
      closeAllModals();
      bar.reset();
      viewScope.reset();
    },
  };
};
