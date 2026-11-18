// Last-good task list in host.storage: the page and the rail render it at
// once on open, the live fetch replaces it. Stored values are capped at
// 64 KB by the host, so the cache is trimmed to fit and drops descriptions
// (the UI refuses description edits until fresh data arrived).
import type { AdapterCapabilities, StorageClient } from '../adapters/types.ts';
import { validateTask, type UnifiedTask } from '../domain/task.ts';

export const LIST_CACHE_KEY = 'list-cache';
const MAX_BYTES = 56_000;

export type CachedHealth = { id: string; label: string; ok: boolean; message: string | null; kind?: 'credentials' };
export type CachedAdapter = { id: string; configured?: boolean; capabilities?: AdapterCapabilities; projects?: string[] };

export type ListCache = {
  tasks: UnifiedTask[];
  health: CachedHealth[];
  adapters: CachedAdapter[] | null;
  savedAt: number;
};

const slim = (task: UnifiedTask): UnifiedTask => ({ ...task, description: '' });

export const buildCache = (input: Omit<ListCache, 'savedAt'>, now: number): ListCache => {
  let tasks = input.tasks.map(slim);
  const make = (list: UnifiedTask[]): ListCache => ({ ...input, tasks: list, savedAt: now });
  let cache = make(tasks);
  while (tasks.length > 0 && JSON.stringify(cache).length > MAX_BYTES) {
    tasks = tasks.slice(0, Math.floor(tasks.length * 0.8));
    cache = make(tasks);
  }
  return cache;
};

export const parseCache = (value: unknown): ListCache | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (!Array.isArray(r.tasks)) return null;
  const tasks = r.tasks.map(validateTask).filter((t): t is UnifiedTask => t !== null);
  const health = Array.isArray(r.health)
    ? r.health.filter((h): h is CachedHealth => !!h && typeof h === 'object' && typeof (h as CachedHealth).id === 'string' && typeof (h as CachedHealth).ok === 'boolean')
    : [];
  const adapters = Array.isArray(r.adapters)
    ? r.adapters.filter((a): a is CachedAdapter => !!a && typeof a === 'object' && typeof (a as CachedAdapter).id === 'string')
    : null;
  return { tasks, health, adapters, savedAt: typeof r.savedAt === 'number' ? r.savedAt : 0 };
};

export const loadListCache = async (storage: Pick<StorageClient, 'get'>): Promise<ListCache | null> =>
  parseCache(await storage.get(LIST_CACHE_KEY));

export const saveListCache = (storage: Pick<StorageClient, 'set'>, cache: ListCache): Promise<void> =>
  storage.set(LIST_CACHE_KEY, cache);
