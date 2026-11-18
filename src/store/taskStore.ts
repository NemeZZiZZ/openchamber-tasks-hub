// Local tasks + remote-linkage overlay + UI prefs, over the storage seam.
// One record per task, so editing one task can never clobber another
// (kanban taskStore pattern).
import { validateTask, type UnifiedTask } from '../domain/task.ts';
import type { StorageClient } from '../adapters/types.ts';

export const TASK_KEY_PREFIX = 'task:';
const READ_BATCH = 16;

export const taskKey = (id: string): string => `${TASK_KEY_PREFIX}${id}`;

export type LoadResult = { tasks: UnifiedTask[]; failedKeys: string[] };

export const loadLocalTasks = async (storage: StorageClient): Promise<LoadResult> => {
  const keys = (await storage.keys()).filter((key) => key.startsWith(TASK_KEY_PREFIX));
  const tasks: UnifiedTask[] = [];
  const failedKeys: string[] = [];
  for (let offset = 0; offset < keys.length; offset += READ_BATCH) {
    await Promise.all(keys.slice(offset, offset + READ_BATCH).map(async (key) => {
      try {
        const task = validateTask(await storage.get(key));
        if (!task || taskKey(task.id) !== key) throw new Error('record does not match its key');
        tasks.push(task);
      } catch {
        failedKeys.push(key);
      }
    }));
  }
  return { tasks, failedKeys };
};

export const saveLocalTask = async (storage: StorageClient, task: UnifiedTask): Promise<void> => {
  const checked = validateTask(task);
  if (!checked) throw new Error('refusing to save an invalid task record');
  await storage.set(taskKey(checked.id), checked);
};

export const deleteLocalTask = (storage: StorageClient, id: string): Promise<void> =>
  storage.delete(taskKey(id));
