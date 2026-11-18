// Shared adapter-test fixture (review #11): one request-recording fetch
// harness instead of a copy-pasted makeCtx per adapter test file.
import type { Ctx, FetchLike } from '../src/adapters/types.ts';

export type FixtureReq = { method: string; url: string; headers: Record<string, string>; bodyText: string };
export type FixtureReply = { status: number; body?: unknown };
export type FixtureSeen = FixtureReq[];

export const makeAdapterCtx = (
  handler: (req: FixtureReq, call: number) => FixtureReply,
  opts?: { settings?: Record<string, string | null>; cli?: string | null; store?: string },
): { ctx: Ctx; seen: FixtureSeen } => {
  const seen: FixtureSeen = [];
  const fetch: FetchLike = (async (url, init) => {
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const bodyText = init?.body ?? '';
    const call = seen.length;
    seen.push({ method, url, headers, bodyText });
    const out = handler(seen[seen.length - 1]!, call);
    return {
      status: out.status,
      json: async () => out.body,
      text: async () => (typeof out.body === 'string' ? out.body : JSON.stringify(out.body ?? null)),
    };
  }) as FetchLike;
  const ctx: Ctx = {
    storage: { keys: async () => [], get: async () => undefined, set: async () => {}, delete: async () => {} },
    settings: async (key) => (opts?.settings ? opts.settings[key] ?? null : null),
    fetch,
    now: () => 1000,
    newId: () => 'n1',
    auth: {
      readStore: async () => opts?.store,
      readSettings: async () => (opts?.settings ?? {}) as Record<string, string>,
      cliToken: async () => (opts?.cli !== undefined ? opts.cli : null),
    },
  };
  return { ctx, seen };
};
