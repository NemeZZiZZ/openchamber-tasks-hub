// Kanban view (GitLab-board style): dynamic columns from the data, accent
// top border per list, collapse chevron in every head, HTML5 drag with
// fractional local-only rank. Moves call back into the shell (service
// PATCH); rank is stored via the overlay, never pushed to the remote.
import { mountMenu, type MenuItem } from '@openchamber/sdk/ui';
import { chevron, closeIcon, el, iconButton, plusIcon, slot, type Scope } from './dom.ts';
import { dueInfo, initials, listAccent, sourceLabel, taskRef } from './present.ts';
import { isClosed, planDrop, type BoardGroup } from './shellState.ts';
import type { UnifiedTask } from '../domain/task.ts';

export type BoardCallbacks = {
  onOpen(task: UnifiedTask): void;
  onMove(task: UnifiedTask, toListId: string, fromListId: string, rank: number): void;
  onToggleCollapse(listId: string): void;
  onMoveColumn(dragged: string, target: string): void;
};

// Per-render knobs: column titles/capabilities depend on the grouping, and
// the card ⋯ menu handles live in the caller's per-paint scope.
export type BoardOptions = {
  writable: boolean;
  title: (listId: string) => string;
  canAdd: (listId: string) => boolean;
  canRemove: (listId: string) => boolean;
  onAdd: (listId: string) => void;
  onRemove: (listId: string) => void;
  scope: Scope;
  menuItems: (task: UnifiedTask) => MenuItem[];
  onMenu: (task: UnifiedTask, id: string) => void;
};

const COLUMN_DND_TYPE = 'text/x-tk-column';
const MAX_LABELS = 3;

const collapsedColumn = (listId: string, count: number, cb: BoardCallbacks, opts: BoardOptions): HTMLElement => {
  const column = el('div', 'tk-column tk-collapsed');
  column.style.setProperty('--c', listAccent(listId));
  column.draggable = true;
  column.dataset.listId = listId;
  column.title = `Expand ${opts.title(listId)}`;
  column.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData(COLUMN_DND_TYPE, listId);
    event.stopPropagation();
  });
  const expand = iconButton(`Expand ${opts.title(listId)}`, chevron('right'), (event) => {
    event.stopPropagation();
    cb.onToggleCollapse(listId);
  });
  column.append(expand, el('span', 'tk-collapsed-title', opts.title(listId)), el('span', 'tk-collapsed-count', String(count)));
  column.addEventListener('click', () => cb.onToggleCollapse(listId));
  return column;
};

const chip = (text: string, tone?: string, title?: string): HTMLElement => {
  const node = el('span', 'tk-chip', text);
  if (tone) node.dataset.tone = tone;
  if (title) node.title = title;
  return node;
};

const card = (task: UnifiedTask, cb: BoardCallbacks, opts: BoardOptions): HTMLElement => {
  const node = el('div', 'tk-card');
  node.draggable = opts.writable;
  node.tabIndex = 0;
  node.dataset.taskId = task.id;
  if (task.needsAttentionSince !== null) node.dataset.attn = '1';
  const top = el('div', 'tk-card-top');
  top.append(el('div', 'tk-item-title', task.title));
  const menuSlot = slot('tk-card-menu');
  menuSlot.addEventListener('click', (event) => event.stopPropagation());
  menuSlot.addEventListener('keydown', (event) => event.stopPropagation());
  opts.scope.keep(mountMenu(menuSlot, { label: '⋯', variant: 'ghost', size: 'xs', items: opts.menuItems(task), onSelect: (id) => opts.onMenu(task, id) }));
  top.append(menuSlot);
  node.append(top);
  if (task.labels.length > 0) {
    const labels = el('div', 'tk-row');
    labels.style.gap = '4px';
    for (const label of task.labels.slice(0, MAX_LABELS)) labels.append(el('span', 'tk-label', label));
    if (task.labels.length > MAX_LABELS) labels.append(el('span', 'tk-muted', `+${task.labels.length - MAX_LABELS}`));
    node.append(labels);
  }
  if (task.syncState === 'error' && task.syncError) node.append(el('div', 'tk-err', `⚠ ${task.syncError}`));
  const info = el('div', 'tk-row');
  info.style.gap = '4px';
  const due = dueInfo(task.dueDate, isClosed(task));
  if (due) info.append(chip(`⏱ ${due.label}`, due.overdue ? 'error' : undefined, due.overdue ? 'Overdue' : 'Due date'));
  if (task.milestone) info.append(chip(`◎ ${task.milestone}`, undefined, 'Milestone'));
  if (task.checklist && task.checklist.total > 0) info.append(chip(`☑ ${task.checklist.done}/${task.checklist.total}`, task.checklist.done === task.checklist.total ? 'success' : undefined, 'Checklist'));
  if (task.comments) info.append(chip(`💬 ${task.comments}`, undefined, 'Comments'));
  if (info.childElementCount > 0) node.append(info);
  const foot = el('div', 'tk-card-foot');
  const src = el('span', 'tk-src', sourceLabel(task.adapterId));
  src.style.setProperty('--c', 'var(--oc-primary)');
  foot.append(src);
  const ref = taskRef(task);
  if (ref) foot.append(el('span', 'tk-mono', ref));
  if (task.sessionId) foot.append(el('span', 'tk-badge', 'agent'));
  if (task.needsAttentionSince !== null) {
    const attn = el('span', 'tk-badge', 'needs attention');
    attn.dataset.tone = 'warning';
    foot.append(attn);
  }
  if (task.assignee) {
    const avatar = el('span', 'tk-avatar', initials(task.assignee));
    avatar.title = task.assignee;
    avatar.style.marginLeft = 'auto';
    foot.append(avatar);
  }
  node.append(foot);
  node.addEventListener('click', () => cb.onOpen(task));
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cb.onOpen(task); }
  });
  node.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData('text/plain', task.id);
    node.classList.add('tk-dragging');
  });
  node.addEventListener('dragend', () => node.classList.remove('tk-dragging'));
  return node;
};

// Drop target shared by expanded and collapsed columns. `cards` is only
// known for expanded columns (rank planning); a collapsed drop appends.
const attachDrop = (column: HTMLElement, listId: string, group: BoardGroup | null, cb: BoardCallbacks, allTasks: readonly UnifiedTask[] | undefined, writable: boolean): void => {
  column.addEventListener('dragover', (event) => {
    const types = event.dataTransfer?.types;
    if (types?.includes(COLUMN_DND_TYPE) || (writable && types?.includes('text/plain'))) {
      event.preventDefault();
      column.classList.add('tk-dragover');
    }
  });
  column.addEventListener('dragleave', (event) => {
    if (!column.contains(event.relatedTarget as Node | null)) column.classList.remove('tk-dragover');
  });
  column.addEventListener('drop', (event) => {
    event.preventDefault();
    column.classList.remove('tk-dragover');
    const draggedColumn = event.dataTransfer?.getData(COLUMN_DND_TYPE);
    if (draggedColumn) {
      if (draggedColumn !== listId) cb.onMoveColumn(draggedColumn, listId);
      return;
    }
    const id = event.dataTransfer?.getData('text/plain');
    if (!id || !allTasks || !writable) return;
    const moving = allTasks.find((t) => t.id === id);
    if (!moving || group?.cards.some((c) => c.id === moving.id)) return;
    const body = column.querySelector('.tk-column-body');
    const after = [...(body?.querySelectorAll('.tk-card:not(.tk-dragging)') ?? [])].find((node) => {
      const box = (node as HTMLElement).getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    const beforeId = after ? ((after as HTMLElement).dataset.taskId ?? null) : null;
    cb.onMove(moving, listId, moving.listId, planDrop(group?.cards ?? [], id, beforeId));
  });
};

const columnNode = (group: BoardGroup, allTasks: readonly UnifiedTask[], cb: BoardCallbacks, opts: BoardOptions): HTMLElement => {
  const column = el('div', 'tk-column');
  column.style.setProperty('--c', listAccent(group.listId));
  column.dataset.listId = group.listId;
  const head = el('div', 'tk-column-head');
  head.title = 'Drag to reorder columns';
  head.draggable = true;
  head.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData(COLUMN_DND_TYPE, group.listId);
    event.dataTransfer?.setDragImage(column, 20, 20);
    event.stopPropagation();
  });
  const name = opts.title(group.listId);
  const title = el('span', 'tk-pillbtn', name);
  title.style.setProperty('--c', listAccent(group.listId));
  head.append(
    iconButton(`Collapse ${name}`, chevron('down'), () => cb.onToggleCollapse(group.listId)),
    title,
    el('span', 'tk-column-count', String(group.cards.length)),
  );
  if (opts.canAdd(group.listId)) head.append(iconButton(`New task in ${name}`, plusIcon(), () => opts.onAdd(group.listId)));
  if (opts.canRemove(group.listId)) head.append(iconButton(`Remove list ${name}`, closeIcon(12), () => opts.onRemove(group.listId)));
  const body = el('div', 'tk-column-body');
  if (group.cards.length === 0) body.append(el('div', 'tk-column-empty', 'No tasks'));
  for (const task of group.cards) body.append(card(task, cb, opts));
  column.append(head, body);
  attachDrop(column, group.listId, group, cb, allTasks, opts.writable);
  return column;
};

export const renderBoard = (
  tasks: readonly UnifiedTask[],
  groups: readonly BoardGroup[],
  cb: BoardCallbacks,
  collapsed: ReadonlySet<string>,
  opts: BoardOptions,
): HTMLElement => {
  const wrap = el('div', 'tk-columns');
  for (const group of groups) {
    if (collapsed.has(group.listId)) {
      const strip = collapsedColumn(group.listId, group.cards.length, cb, opts);
      attachDrop(strip, group.listId, group, cb, tasks, opts.writable);
      wrap.append(strip);
    } else wrap.append(columnNode(group, tasks, cb, opts));
  }
  if (groups.length === 0) {
    const empty = el('div', 'tk-empty');
    empty.append(el('b', '', 'No tasks match the filters'));
    wrap.append(empty);
  }
  return wrap;
};
