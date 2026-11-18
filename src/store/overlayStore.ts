// Remote-task overlay: sessionId, board rank and attention badge for remote
// tasks live locally (host.storage meta:<adapterId>:<externalId>), never in
// the remote system (design "Local overlay for remote linkage").
import type { StorageClient } from '../adapters/types.ts';

export const OVERLAY_KEY_PREFIX = 'meta:';

export const overlayKey = (adapterId: string, externalId: string): string =>
  `${OVERLAY_KEY_PREFIX}${adapterId}:${externalId}`;

export type TaskOverlay = {
  sessionId: string | null;
  rank: number | null;
  needsAttentionSince: number | null;
};

export const DEFAULT_OVERLAY: TaskOverlay = { sessionId: null, rank: null, needsAttentionSince: null };

const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isNumOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v));

// Defensive parse: malformed record → null (caller treats as no overlay).
export const parseOverlay = (raw: unknown): TaskOverlay | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isStrOrNull(r.sessionId) || !isNumOrNull(r.rank) || !isNumOrNull(r.needsAttentionSince)) return null;
  return { sessionId: r.sessionId, rank: r.rank, needsAttentionSince: r.needsAttentionSince };
};

export const getOverlay = async (
  storage: StorageClient,
  adapterId: string,
  externalId: string,
): Promise<TaskOverlay | null> => parseOverlay(await storage.get(overlayKey(adapterId, externalId)));

// Merge-set: read-modify-write so fields the caller omits survive intact.
export const setOverlay = async (
  storage: StorageClient,
  adapterId: string,
  externalId: string,
  patch: Partial<TaskOverlay>,
): Promise<void> => {
  const current = (await getOverlay(storage, adapterId, externalId)) ?? DEFAULT_OVERLAY;
  const next: TaskOverlay = { ...current, ...patch };
  if (!parseOverlay(next)) throw new Error('refusing to save an invalid overlay record');
  await storage.set(overlayKey(adapterId, externalId), next);
};

export const deleteOverlay = (
  storage: StorageClient,
  adapterId: string,
  externalId: string,
): Promise<void> => storage.delete(overlayKey(adapterId, externalId));
