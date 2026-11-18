// Shared JSON guard for adapters (review #11): one definition instead of a
// copy-paste per adapter file.
export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
