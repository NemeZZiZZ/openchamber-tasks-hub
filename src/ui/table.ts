// List view. Wide: a compact table (title column gets the space). Narrow
// (data-size="s"): the same rows as stacked items — nothing is crushed or
// scrolled sideways. Newest-first ordering comes from shellState.tableOrder.
import { el } from './dom.ts';
import { initials, listAccent, listTitle, repoName, sourceLabel, taskRef, timeAgo } from './present.ts';
import type { UnifiedTask } from '../domain/task.ts';

export type TableCallbacks = {
  onOpen(task: UnifiedTask): void;
  onRetry(task: UnifiedTask): void;
};

const listPill = (listId: string): HTMLElement => {
  const pill = el('span', 'tk-pillbtn', listTitle(listId));
  pill.style.setProperty('--c', listAccent(listId));
  pill.style.cursor = 'default';
  return pill;
};

const titleBlock = (task: UnifiedTask, cb: TableCallbacks): HTMLElement => {
  const box = el('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0';
  box.append(el('div', 'tk-item-title', task.title));
  if (task.labels.length > 0) {
    const labels = el('div', 'tk-row');
    labels.style.gap = '4px';
    for (const label of task.labels.slice(0, 4)) labels.append(el('span', 'tk-label', label));
    box.append(labels);
  }
  if (task.syncState === 'error' && task.syncError) {
    const err = el('div', 'tk-err', `⚠ ${task.syncError} `);
    const retry = el('button', 'tk-pillbtn', 'Retry');
    retry.style.setProperty('--c', 'var(--oc-error)');
    retry.addEventListener('click', (event) => { event.stopPropagation(); cb.onRetry(task); });
    err.append(retry);
    box.append(err);
  }
  return box;
};

const badges = (task: UnifiedTask): HTMLElement[] => {
  const out: HTMLElement[] = [];
  if (task.sessionId) out.push(el('span', 'tk-badge', 'agent'));
  if (task.needsAttentionSince !== null) {
    const attn = el('span', 'tk-badge', 'needs attention');
    attn.dataset.tone = 'warning';
    out.push(attn);
  }
  return out;
};

const stacked = (rows: readonly UnifiedTask[], cb: TableCallbacks): HTMLElement => {
  const list = el('div', 'tk-list');
  for (const task of rows) {
    const item = el('div', 'tk-item');
    item.tabIndex = 0;
    if (task.needsAttentionSince !== null) item.dataset.attn = '1';
    const top = el('div', 'tk-item-top');
    top.append(titleBlock(task, cb));
    top.firstElementChild?.classList.add('tk-grow');
    top.append(listPill(task.listId));
    const sub = el('div', 'tk-item-sub');
    const src = el('span', 'tk-src', sourceLabel(task.adapterId));
    src.style.setProperty('--c', 'var(--oc-primary)');
    sub.append(src);
    const ref = taskRef(task);
    if (ref) sub.append(el('span', 'tk-mono', ref));
    if (task.projectRef) sub.append(el('span', '', repoName(task.projectRef)));
    sub.append(...badges(task));
    if (task.updatedAt) sub.append(el('span', '', timeAgo(task.updatedAt)));
    if (task.assignee) {
      const avatar = el('span', 'tk-avatar', initials(task.assignee));
      avatar.title = task.assignee;
      avatar.style.marginLeft = 'auto';
      sub.append(avatar);
    }
    item.append(top, sub);
    item.addEventListener('click', () => cb.onOpen(task));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cb.onOpen(task); }
    });
    list.append(item);
  }
  return list;
};

const wide = (rows: readonly UnifiedTask[], cb: TableCallbacks): HTMLElement => {
  const table = el('table', 'tk-table');
  const cols: [string, string][] = [['Source', '96px'], ['Title', ''], ['List', '120px'], ['Project', '130px'], ['', '34px'], ['Updated', '86px']];
  const colgroup = el('colgroup');
  const head = el('tr');
  for (const [label, width] of cols) {
    const col = el('col');
    if (width) col.style.width = width;
    colgroup.append(col);
    head.append(el('th', '', label));
  }
  const thead = el('thead');
  thead.append(head);
  table.append(colgroup, thead);
  const tbody = el('tbody');
  for (const task of rows) {
    const tr = el('tr');
    tr.tabIndex = 0;
    tr.addEventListener('click', () => cb.onOpen(task));
    tr.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') cb.onOpen(task);
    });
    const source = el('td');
    const src = el('span', 'tk-src', sourceLabel(task.adapterId));
    src.style.setProperty('--c', 'var(--oc-primary)');
    source.append(src);
    const title = el('td', 'tk-cell-title');
    title.append(titleBlock(task, cb));
    const extra = badges(task);
    if (extra.length > 0) {
      const row = el('div', 'tk-row');
      row.style.marginTop = '4px';
      row.append(...extra);
      title.append(row);
    }
    const list = el('td');
    list.append(listPill(task.listId));
    const project = el('td');
    project.append(el('span', 'tk-mono tk-cell-clip', repoName(task.projectRef)));
    const assignee = el('td');
    if (task.assignee) {
      const avatar = el('span', 'tk-avatar', initials(task.assignee));
      avatar.title = task.assignee;
      assignee.append(avatar);
    }
    const updated = el('td');
    updated.append(el('span', 'tk-muted tk-cell-clip', timeAgo(task.updatedAt)));
    tr.append(source, title, list, project, assignee, updated);
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
};

export const renderTable = (rows: readonly UnifiedTask[], cb: TableCallbacks, narrow: boolean): HTMLElement => {
  if (rows.length === 0) {
    const empty = el('div', 'tk-empty');
    empty.append(el('b', '', 'No tasks match the filters'));
    return empty;
  }
  return narrow ? stacked(rows, cb) : wide(rows, cb);
};
