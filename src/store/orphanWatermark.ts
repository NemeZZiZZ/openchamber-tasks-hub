// "Going forward only" for orphan adoption: a persisted cutoff survives the
// page closing and reopening (a page-type extension has no reliable
// in-memory first snapshot). Lives in the panel's own host.storage.
import type { StorageClient } from '../adapters/types.ts';

export const WATERMARK_KEY = 'orphanWatermark';

export const loadWatermark = async (storage: StorageClient): Promise<number> => {
  const raw = await storage.get(WATERMARK_KEY);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
};

export const saveWatermark = (storage: StorageClient, ts: number): Promise<void> =>
  storage.set(WATERMARK_KEY, ts);
