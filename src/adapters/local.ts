// The local adapter: "external system" = the extension's own store, so the
// engine never branches on "local vs remote" (design approach A).
import { validateTask, applyPatch, createLocalTask, type UnifiedTask } from '../domain/task.ts';
import { checklistProgress } from '../domain/checklist.ts';
import { statusForListId } from '../domain/statusMap.ts';
import { taskKey, loadLocalTasks, saveLocalTask, deleteLocalTask } from '../store/taskStore.ts';
// Local "capabilities" — labels edit via patch.labels, the rest is read-only.
import { AdapterError, type AdapterOptions, type Ctx, type NewTask, type RemoteTask, type Scope, type TaskAdapter } from './types.ts';

const toRemote = (t: UnifiedTask): RemoteTask => ({
  externalId: t.externalId,
  url: t.url,
  title: t.title,
  description: t.description,
  listId: t.listId,
  status: t.status,
  projectRef: t.projectRef,
  assignee: t.assignee,
  labels: t.labels,
  updatedAt: t.updatedAt,
  author: null,
  closed: t.status === 'done',
  checklist: checklistProgress(t.description),
});

export const localAdapter: TaskAdapter = {
  id: 'local',
  label: 'Local',
  storeKey: null,
  publicHosts: [],

  async list(ctx: Ctx, _scope: Scope): Promise<RemoteTask[]> {
    return (await loadLocalTasks(ctx.storage)).tasks.map(toRemote);
  },

  async get(ctx: Ctx, id: string): Promise<RemoteTask | null> {
    // Adapter-level id is the externalId; the stored record is keyed by the
    // full unified id (t_<externalId>).
    const t = validateTask(await ctx.storage.get(taskKey(`t_${id}`)));
    return t ? toRemote(t) : null;
  },

  async create(ctx: Ctx, input: NewTask): Promise<string> {
    const id = ctx.newId();
    const status = input.listId !== undefined ? statusForListId('local', input.listId) : undefined;
    const task = createLocalTask({ id, title: input.title, description: input.description, status, now: ctx.now() });
    await saveLocalTask(ctx.storage, task);
    return task.externalId;
  },

  async update(ctx: Ctx, id: string, patch): Promise<void> {
    const existing = validateTask(await ctx.storage.get(taskKey(`t_${id}`)));
    if (!existing) throw new Error('not-found');
    const next = applyPatch(existing, patch, ctx.now());
    // Local invariant: listId === status (columns are the five statuses);
    // whichever side the patch touched wins, the other follows.
    if (typeof patch?.listId === 'string' && patch.listId.length > 0) {
      next.status = statusForListId('local', next.listId);
      next.listId = next.status;
    } else if (next.listId !== next.status) {
      next.listId = next.status;
    }
    await saveLocalTask(ctx.storage, next);
  },

  capabilities: {
    create: true,
    delete: true,
    fields: { assignee: false, milestone: false, dueDate: false, labels: true },
  },

  async delete(ctx: Ctx, id: string): Promise<void> {
    const existing = validateTask(await ctx.storage.get(taskKey(`t_${id}`)));
    if (!existing) throw new AdapterError(`local task ${id} not found`, false, true);
    await deleteLocalTask(ctx.storage, `t_${id}`);
  },

  async options(ctx: Ctx, _projectRef: string): Promise<AdapterOptions> {
    const { tasks } = await loadLocalTasks(ctx.storage);
    return { people: [], milestones: [], labels: [...new Set(tasks.flatMap((t) => t.labels))] };
  },
};
