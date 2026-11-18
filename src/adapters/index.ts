// Adapter registry. New platform = implement TaskAdapter + registerAdapter
// here.
import type { AdapterId } from '../domain/task.ts';
import { localAdapter } from './local.ts';
import { githubAdapter } from './github.ts';
import { gitlabAdapter } from './gitlab.ts';
import { trelloAdapter } from './trello.ts';
import { linearAdapter } from './linear.ts';
import { jiraAdapter } from './jira.ts';
import type { TaskAdapter } from './types.ts';

const registry = new Map<AdapterId, TaskAdapter>();

export function registerAdapter(adapter: TaskAdapter): void {
  registry.set(adapter.id, adapter);
}

export function getAdapter(id: string): TaskAdapter | null {
  return registry.get(id as AdapterId) ?? null;
}

export function registeredAdapters(): TaskAdapter[] {
  return [...registry.values()];
}

registerAdapter(localAdapter);
registerAdapter(githubAdapter);
registerAdapter(gitlabAdapter);
registerAdapter(trelloAdapter);
registerAdapter(linearAdapter);
registerAdapter(jiraAdapter);

