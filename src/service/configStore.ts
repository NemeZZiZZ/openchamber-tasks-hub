// File-backed KV storage for the service data dir: the storage seam for
// local tasks, remote-linkage overlays and engine bookkeeping (cache /
// sync-error keys). One JSON file, debounced atomic writes.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageClient } from '../adapters/types.ts';

const FLUSH_MS = 50;

export const createFileStorage = (dataDir: string): StorageClient => {
  const file = join(dataDir, 'tasks-store.json');
  let data: Record<string, unknown> | null = null;
  // A read error that is not "missing file" must never reset the store:
  // the next flush would otherwise overwrite real tasks with {}.
  let loadFailed = false;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  const load = async (): Promise<Record<string, unknown>> => {
    if (data) return data;
    try {
      const raw = await readFile(file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        data = {};
      } else {
        // Keep serving memory, but refuse to persist over a store we
        // could not read — data loss would be silent and total.
        loadFailed = true;
        data = {};
      }
    }
    return data;
  };

  const flush = async (): Promise<void> => {
    if (!data || loadFailed) return;
    const snapshot = { ...data };
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(snapshot));
    await rename(`${file}.tmp`, file);
  };

  const scheduleFlush = (): void => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writing = writing.then(flush).catch((err) => {
        console.error('[tasks] store flush failed:', (err as Error).message);
      });
    }, FLUSH_MS);
  };

  return {
    keys: async () => Object.keys(await load()),
    get: async (key) => (await load())[key],
    set: async (key, value) => {
      (await load())[key] = value;
      scheduleFlush();
    },
    delete: async (key) => {
      delete (await load())[key];
      scheduleFlush();
    },
  };
};
