// Task detail modal: meta chips, editable title/description, capability-gated
// due date / labels / assignee / milestone fields, list select, delete with a
// per-source confirm modal and the agent actions — all controls from the SDK
// UI kit.
import { mountButton, mountSelect, mountTextField } from '@openchamber/sdk/ui';
import { clear, el, slot } from './dom.ts';
import { openModal, type Modal } from './modal.ts';
import { listAccent, listTitle, repoName, sourceLabel, taskRef, timeAgo } from './present.ts';
import { deleteConfirm } from './shellState.ts';
import { detailCanSave } from './detailState.ts';
import type { AdapterCapabilities, AdapterOptions } from '../adapters/types.ts';
import type { TaskPatch, UnifiedTask } from '../domain/task.ts';

export type DetailCallbacks = {
  onSave(task: UnifiedTask, patch: TaskPatch): void;
  onMove(task: UnifiedTask, toListId: string, fromListId: string): void;
  onStartAgent(task: UnifiedTask): void;
  onOpenChat(task: UnifiedTask): void;
  onOpenUrl(url: string): void;
  onDelete(task: UnifiedTask): void;
  onOptions(task: UnifiedTask): Promise<AdapterOptions | null>;
};

// Kit buttons render their own node inside the mount slot; the destructive
// tint goes straight onto that node (outline draws its border from
// currentColor, so text and border go red together).
const paintDanger = (root: HTMLElement): void => {
  const node = root.querySelector('button');
  if (node) node.style.cssText = 'color:var(--oc-error-text,var(--oc-error))';
};

export const openDetail = (
  task: UnifiedTask,
  lists: readonly string[],
  cb: DetailCallbacks,
  opts: { stale: boolean; capabilities?: AdapterCapabilities; onClose?: () => void },
): Modal => {
  const cap = opts.capabilities;
  const header = el('span', 'tk-row');
  header.style.gap = '8px';
  const ref = taskRef(task);
  const titleText = el('span', '', task.title);
  header.append(titleText);
  const modal = openModal({ title: header, onClose: opts.onClose });
  const { body, foot, scope } = modal;

  const meta = el('div', 'tk-meta');
  const src = el('span', 'tk-src', sourceLabel(task.adapterId));
  src.style.setProperty('--c', 'var(--oc-primary)');
  meta.append(src);
  if (ref) meta.append(el('span', 'tk-mono', ref));
  if (task.projectRef) meta.append(el('span', 'tk-mono', repoName(task.projectRef)));
  if (task.assignee) meta.append(el('span', '', `@${task.assignee}`));
  if (task.updatedAt) meta.append(el('span', '', `updated ${timeAgo(task.updatedAt)}`));
  // Remote data becomes an href: only http(s) may be opened.
  if (task.url && (task.url.startsWith('http://') || task.url.startsWith('https://'))) {
    const url = task.url;
    const link = el('a', '', `Open in ${sourceLabel(task.adapterId)} ↗`);
    link.href = url;
    link.addEventListener('click', (event) => { event.preventDefault(); cb.onOpenUrl(url); });
    meta.append(link);
  }
  body.append(meta);

  // Label chips up top only while the labels editor below is unavailable —
  // with the capability present the form's editable pills are the display.
  if (task.labels.length > 0 && !cap?.fields.labels) {
    const labels = el('div', 'tk-row');
    labels.style.gap = '4px';
    for (const label of task.labels) labels.append(el('span', 'tk-label', label));
    body.append(labels);
  }
  if (task.syncState === 'error') body.append(el('div', 'tk-err', `Sync error: ${task.syncError ?? 'unknown'}`));
  if (task.needsAttentionSince !== null) {
    const attention = el('span', 'tk-badge', 'Agent needs attention');
    attention.dataset.tone = 'warning';
    body.append(attention);
  }

  const patch: NonNullable<Parameters<DetailCallbacks['onSave']>[1]> = {};
  let dueDate: string | null = task.dueDate ?? null;
  let labels: string[] = [...task.labels];
  let assigneeId: string | null | undefined = undefined; // undefined = untouched
  let milestoneId: string | null | undefined = undefined;

  const form = el('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  const titleSlot = slot();
  const bodySlot = slot();
  const listSlot = slot();
  form.append(titleSlot, bodySlot);
  body.append(form);

  let title = task.title;
  let description = task.description;
  const dirty = () => detailCanSave(title,
    title !== task.title
    || (!opts.stale && description !== task.description)
    || Boolean(cap?.fields.dueDate && dueDate !== (task.dueDate ?? null))
    || Boolean(cap?.fields.labels && JSON.stringify([...labels].sort()) !== JSON.stringify([...task.labels].sort()))
    || assigneeId !== undefined
    || milestoneId !== undefined);

  const saveSlot = slot();
  const save = scope.keep(mountButton(saveSlot, { label: 'Save', disabled: true, onClick: () => doSave() }));
  const sync = () => save.update({ disabled: !dirty() });
  scope.keep(mountTextField(titleSlot, { label: 'Title', value: title, onChange: (v) => { title = v; sync(); } }));
  scope.keep(mountTextField(bodySlot, {
    label: 'Description',
    value: description,
    multiline: true,
    rows: 8,
    disabled: opts.stale,
    helper: opts.stale ? 'Loading the latest data…' : undefined,
    onChange: (v) => { description = v; sync(); },
  }));

  // Due date — native input, only when the source supports it.
  if (cap?.fields.dueDate) {
    const dueField = el('div');
    dueField.append(el('div', 'tk-field-label', 'Due date'));
    const due = el('input');
    due.type = 'date';
    due.value = (task.dueDate ?? '').slice(0, 10);
    due.addEventListener('change', () => { dueDate = due.value || null; sync(); });
    dueField.append(due);
    form.append(dueField);
  }

  // Labels — pill chips with ×, add via select (Trello: board-defined ids)
  // or free text (everything else).
  if (cap?.fields.labels) {
    const labelBox = el('div');
    labelBox.append(el('div', 'tk-field-label', 'Labels'));
    const pills = el('div', 'tk-row');
    pills.style.gap = '4px';
    const paintLabels = (): void => {
      clear(pills);
      for (const name of labels) {
        const pill = el('span', 'tk-label', name);
        const x = el('button', 'tk-note-x', '×');
        x.type = 'button';
        x.addEventListener('click', () => { labels = labels.filter((l) => l !== name); sync(); paintLabels(); });
        pill.append(x);
        pills.append(pill);
      }
    };
    paintLabels();
    labelBox.append(pills);
    // Add control: sources whose API only accepts existing labels declare
    // labelsFromOptions; everything else takes free text and the adapter
    // reports unknown labels honestly.
    if (cap.labelsFromOptions) {
      const addSlot = slot();
      labelBox.append(addSlot);
      void cb.onOptions(task).then((adapterOptions) => {
        if (!adapterOptions || adapterOptions.labels.length === 0) return;
        const labelAdd = scope.keep(mountSelect(addSlot, {
          value: null,
          options: adapterOptions.labels.filter((l) => !labels.includes(l)).map((l) => ({ id: l, label: l })),
          placeholder: 'Add label…',
          onChange: (id) => {
            if (!labels.includes(id)) { labels = [...labels, id]; sync(); paintLabels(); }
            // The kit select is controlled: push the state back or the
            // trigger never repaints. Add-selects reset to the placeholder
            // and drop the added label — the shell's "Add list…" pattern.
            labelAdd.update({ value: null, options: adapterOptions.labels.filter((l) => !labels.includes(l)).map((l) => ({ id: l, label: l })) });
          },
        }));
      });
    } else {
      const addSlot = slot();
      labelBox.append(addSlot);
      scope.keep(mountTextField(addSlot, {
        label: 'Add label',
        value: '',
        onChange: () => { /* consumed on Enter via the keydown below */ },
      }));
      const addInput = addSlot.querySelector('input, textarea') as HTMLInputElement | null;
      addInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const name = addInput.value.trim();
        if (name && !labels.includes(name)) { labels = [...labels, name]; sync(); paintLabels(); }
        addInput.value = '';
        e.preventDefault();
      });
    }
    form.append(labelBox);
  }

  // Assignee / milestone — mounted once the options reply arrives; the
  // card's current value always appears in its own select even when the
  // fetched options omit it. A failed load degrades: nothing mounts here
  // and title/description/due date/labels stay editable.
  if (cap?.fields.assignee || cap?.fields.milestone) {
    void cb.onOptions(task).then((adapterOptions) => {
      if (!adapterOptions) return; // dialog degrades: title/desc/date still editable
      if (cap?.fields.assignee) {
        const people = [...adapterOptions.people];
        if (task.assignee && !people.some((p) => p.name === task.assignee)) {
          people.unshift({ id: task.assignee, name: task.assignee });
        }
        const mount = slot('tk-row');
        const peopleSelect = scope.keep(mountSelect(mount, {
          value: people.find((p) => p.name === task.assignee)?.id ?? '__none__',
          options: [{ id: '__none__', label: 'Unassigned' }, ...people.map((p) => ({ id: p.id, label: p.name }))],
          onChange: (id) => {
            assigneeId = id === '__none__' ? null : id;
            const person = people.find((p) => p.id === id);
            patch.assignee = id === '__none__' ? null : person?.name ?? id;
            sync();
            peopleSelect.update({ value: id }); // controlled kit select: repaint the trigger
          },
        }));
        const peopleField = el('div');
        peopleField.append(el('div', 'tk-field-label', 'Assignee'), mount);
        form.insertBefore(peopleField, listSlot);
      }
      if (cap?.fields.milestone) {
        const milestones = [...adapterOptions.milestones];
        if (task.milestone && !milestones.some((m) => m.name === task.milestone)) {
          milestones.unshift({ id: task.milestone, name: task.milestone });
        }
        const mount = slot('tk-row');
        const milestoneSelect = scope.keep(mountSelect(mount, {
          value: milestones.find((m) => m.name === task.milestone)?.id ?? '__none__',
          options: [{ id: '__none__', label: 'None' }, ...milestones.map((m) => ({ id: m.id, label: m.name }))],
          onChange: (id) => {
            milestoneId = id === '__none__' ? null : id;
            const ms = milestones.find((m) => m.id === id);
            patch.milestone = id === '__none__' ? null : ms?.name ?? id;
            sync();
            milestoneSelect.update({ value: id }); // controlled kit select: repaint the trigger
          },
        }));
        const milestoneField = el('div');
        milestoneField.append(el('div', 'tk-field-label', 'Milestone'), mount);
        form.insertBefore(milestoneField, listSlot);
      }
    });
  }

  form.append(listSlot);
  const options = [...new Set([task.listId, ...lists])].map((id) => ({ id, label: listTitle(id) }));
  const listField = el('div');
  listField.append(el('div', 'tk-field-label', 'List'));
  const listMount = slot('tk-row');
  listField.append(listMount);
  const dot = el('span', 'tk-dot');
  dot.style.background = listAccent(task.listId);
  listMount.append(dot);
  const selectSlot = slot();
  listMount.append(selectSlot);
  listSlot.append(listField);
  scope.keep(mountSelect(selectSlot, {
    value: task.listId,
    options,
    onChange: (id) => {
      if (id === task.listId) return;
      cb.onMove(task, id, task.listId);
      modal.close();
    },
  }));

  const doSave = () => {
    if (!dirty()) return; // also guards programmatic clicks with an empty title
    const savePatch: TaskPatch = { ...patch };
    if (title !== task.title) savePatch.title = title;
    if (!opts.stale && description !== task.description) savePatch.description = description;
    if (cap?.fields.dueDate && dueDate !== (task.dueDate ?? null)) savePatch.dueDate = dueDate;
    if (cap?.fields.labels && JSON.stringify([...labels].sort()) !== JSON.stringify([...task.labels].sort())) savePatch.labels = labels;
    if (assigneeId !== undefined) { savePatch.assigneeId = assigneeId; if (!('assignee' in savePatch)) savePatch.assignee = null; }
    if (milestoneId !== undefined) { savePatch.milestoneId = milestoneId; if (!('milestone' in savePatch)) savePatch.milestone = null; }
    cb.onSave(task, savePatch);
    modal.close();
  };

  const agentSlot = slot();
  if (task.sessionId) {
    const chatSlot = slot();
    foot.append(chatSlot);
    scope.keep(mountButton(chatSlot, { label: 'Open chat', variant: 'outline', onClick: () => { cb.onOpenChat(task); modal.close(); } }));
  }
  // Delete — per-source confirm modal, gated on the adapter's declared
  // capability (no UI hardcoding); an unsupported delete shows the
  // adapter's deleteNote instead.
  const confirm = deleteConfirm(task, cap);
  if (confirm) {
    const askDelete = (): void => {
      const confirmModal = openModal({ title: confirm.title });
      confirmModal.body.append(el('p', 'tk-muted', confirm.body));
      const cancelSlot = slot();
      const goSlot = slot();
      confirmModal.foot.append(cancelSlot, goSlot);
      confirmModal.scope.keep(mountButton(cancelSlot, { label: 'Cancel', variant: 'ghost', onClick: () => confirmModal.close() }));
      confirmModal.scope.keep(mountButton(goSlot, { label: 'Delete', variant: 'outline', onClick: () => { confirmModal.close(); cb.onDelete(task); modal.close(); } }));
      paintDanger(goSlot);
    };
    const deleteSlot = slot();
    foot.append(deleteSlot);
    scope.keep(mountButton(deleteSlot, { label: 'Delete', variant: 'outline', onClick: () => askDelete() }));
    paintDanger(deleteSlot);
  } else if (cap?.deleteNote) {
    body.append(el('div', 'tk-muted', cap.deleteNote));
  }
  foot.append(agentSlot, saveSlot);
  scope.keep(mountButton(agentSlot, {
    label: task.sessionId ? 'Restart agent' : 'Start agent',
    variant: 'secondary',
    onClick: () => { cb.onStartAgent(task); modal.close(); },
  }));
  return modal;
};
