// "New task" modal opened from a column's + button: source, project, title,
// description. The caller maps the column to labels / listId and POSTs.
import { mountButton, mountSelect, mountTextField } from '@openchamber/sdk/ui';
import { el, slot } from './dom.ts';
import { openModal } from './modal.ts';
import { repoName } from './present.ts';
import { createFormValid, resolveCreateSelection } from './createState.ts';

export type CreateForm = { adapterId: string; projectRef: string | null; title: string; description: string };

export type CreateOptions = {
  columnTitle: string;
  adapters: { id: string; label: string }[];
  projectsByAdapter: Record<string, string[]>;
  defaults: { adapterId: string | null; projectRef: string | null };
  onSubmit: (form: CreateForm) => Promise<void>;
};

export const openCreate = (opts: CreateOptions): void => {
  const modal = openModal({ title: `New task · ${opts.columnTitle}` });
  const { scope, body, foot } = modal;
  const form = el('div', 'tk-form');
  const sourceSlot = slot();
  const projectSlot = slot();
  const titleSlot = slot();
  const descSlot = slot();
  form.append(sourceSlot, projectSlot, titleSlot, descSlot);
  body.append(form);
  const error = el('div', 'tk-err');
  error.hidden = true;
  body.append(error);

  const initial = resolveCreateSelection(opts.adapters, opts.projectsByAdapter, opts.defaults);
  let adapterId = initial.adapterId;
  let projectRef = initial.projectRef;
  let title = '';
  let description = '';
  let busy = false;

  const projectsFor = (id: string): string[] => opts.projectsByAdapter[id] ?? [];
  const needsProject = (id: string): boolean => id !== 'local';
  const projectOptions = () => projectsFor(adapterId).map((id) => ({ id, label: repoName(id) || id, hint: id }));
  const valid = (): boolean => createFormValid(adapterId, projectRef, title, opts.projectsByAdapter);

  const submitSlot = slot();
  foot.append(submitSlot);
  const submit = scope.keep(mountButton(submitSlot, { label: 'Create', disabled: true, onClick: () => { void send(); } }));
  const sync = (): void => submit.update({ disabled: !valid() || busy, loading: busy });

  const source = scope.keep(mountSelect(sourceSlot, {
    label: 'Source',
    value: adapterId,
    options: opts.adapters.map((a) => ({ id: a.id, label: a.label })),
    onChange: (id) => {
      adapterId = id;
      const list = projectsFor(id);
      if (!projectRef || !list.includes(projectRef)) projectRef = list[0] ?? null;
      paint();
    },
  }));
  const project = scope.keep(mountSelect(projectSlot, {
    label: 'Project',
    value: projectRef,
    options: projectOptions(),
    searchable: true,
    placeholder: 'Choose a project',
    onChange: (id) => { projectRef = id; sync(); },
  }));
  const paint = (): void => {
    source.update({ value: adapterId });
    project.update({ value: projectRef, options: projectOptions(), disabled: !needsProject(adapterId) });
    projectSlot.hidden = !needsProject(adapterId);
    sync();
  };
  scope.keep(mountTextField(titleSlot, { label: 'Title', value: '', onChange: (v) => { title = v; sync(); } }));
  scope.keep(mountTextField(descSlot, { label: 'Description', value: '', multiline: true, rows: 5, onChange: (v) => { description = v; } }));
  paint();

  const send = async (): Promise<void> => {
    if (!valid() || busy) return;
    busy = true;
    error.hidden = true;
    sync();
    try {
      await opts.onSubmit({ adapterId, projectRef: needsProject(adapterId) ? projectRef : null, title: title.trim(), description });
      modal.close();
    } catch (err) {
      busy = false;
      error.textContent = `⚠ ${err instanceof Error ? err.message : String(err)}`;
      error.hidden = false;
      sync();
    }
  };
};
