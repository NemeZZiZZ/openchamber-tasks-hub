// Pure HTTP routing for the service: bearer gate + route table. No I/O of
// its own — everything goes through the engine, so tests drive it directly.
import { timingSafeEqual } from 'node:crypto';
import { TASK_STATUSES, type TaskPatch } from '../domain/task.ts';
import { AdapterError } from '../adapters/types.ts';
import type { createEngine } from './engine.ts';

type Engine = ReturnType<typeof createEngine>;

export type RequestInput = { method: string; url: string; body: string; bearer: string | null };
export type Reply = { status: number; body: unknown };

const reply = (status: number, body: unknown): Reply => ({ status, body });

const safeBearer = (actual: string | null, expected: string): boolean => {
  if (!expected || actual === null) return false;
  const want = `Bearer ${expected}`;
  if (actual.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(want));
};

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asLabels = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((l): l is string => typeof l === 'string') : undefined;

// Overlay patch shape: sessionId / needsAttentionSince / rank, string|number|null.
const asRecordPatch = (raw: unknown): { sessionId?: string | null; needsAttentionSince?: number | null; rank?: number | null } | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: { sessionId?: string | null; needsAttentionSince?: number | null; rank?: number | null } = {};
  if (typeof r.sessionId === 'string' || r.sessionId === null) out.sessionId = r.sessionId;
  if ((typeof r.needsAttentionSince === 'number' && Number.isFinite(r.needsAttentionSince)) || r.needsAttentionSince === null) out.needsAttentionSince = r.needsAttentionSince;
  if ((typeof r.rank === 'number' && Number.isFinite(r.rank)) || r.rank === null) out.rank = r.rank;
  return Object.keys(out).length > 0 ? out : null;
};

const sanitizePatch = (raw: unknown): TaskPatch | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const patch: TaskPatch = {};
  const title = asString(r.title);
  const description = asString(r.description);
  const listId = asString(r.listId);
  const fromListId = asString(r.fromListId);
  const status = (TASK_STATUSES as readonly string[]).includes(r.status as string)
    ? (r.status as TaskPatch['status'])
    : undefined;
  const labels = asLabels(r.labels);
  const addLabels = asLabels(r.addLabels);
  const removeLabels = asLabels(r.removeLabels);
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (status !== undefined) patch.status = status;
  if (listId !== undefined) patch.listId = listId;
  if (fromListId !== undefined) patch.fromListId = fromListId;
  if (labels !== undefined) patch.labels = labels;
  if (addLabels !== undefined) patch.addLabels = addLabels;
  if (removeLabels !== undefined) patch.removeLabels = removeLabels;
  // Lifecycle field edits (design 2026-11-21): display strings cap at 256
  // chars; null clears the field; anything else is dropped.
  const oneOrNull = (v: unknown): string | null | undefined =>
    typeof v === 'string' ? v.slice(0, 256) : v === null ? null : undefined;
  const dueOrNull = (v: unknown): string | null | undefined =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : v === null ? null : undefined;
  const assignee = oneOrNull(r.assignee);
  const assigneeId = oneOrNull(r.assigneeId);
  const milestone = oneOrNull(r.milestone);
  const milestoneId = oneOrNull(r.milestoneId);
  const dueDate = dueOrNull(r.dueDate);
  if (assignee !== undefined) patch.assignee = assignee;
  if (assigneeId !== undefined) patch.assigneeId = assigneeId;
  if (milestone !== undefined) patch.milestone = milestone;
  if (milestoneId !== undefined) patch.milestoneId = milestoneId;
  if (dueDate !== undefined) patch.dueDate = dueDate;
  return Object.keys(patch).length > 0 ? patch : null;
};

export const handleRequest = async (
  req: RequestInput,
  engine: Engine,
  expectedBearer: string,
): Promise<Reply> => {
  // Loopback-only, but a constant-time compare is one line.
  if (!safeBearer(req.bearer, expectedBearer)) return reply(401, { error: 'unauthorized' });
  let url: URL;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch {
    return reply(400, { error: 'bad-request' });
  }

  if (req.method === 'GET' && url.pathname === '/tasks') {
    const result = await engine.list({
      adapter: url.searchParams.get('adapter') ?? undefined,
      project: url.searchParams.get('project') ?? undefined,
      q: url.searchParams.get('q') ?? undefined,
      assignee: url.searchParams.get('assignee') ?? undefined,
    });
    return reply(200, result);
  }

  if (req.method === 'GET' && url.pathname === '/status') return reply(200, await engine.status());
  if (req.method === 'GET' && url.pathname === '/accounts') return reply(200, await engine.accounts());
  if (req.method === 'GET' && url.pathname === '/adapters') return reply(200, await engine.adapters());
  if (req.method === 'GET' && url.pathname === '/health') return reply(200, { ok: true });

  // POST /link { adapterId, externalId, patch } — overlay write-through for
  // the panel's session sync (sessionId, needsAttentionSince, rank).
  if (req.method === 'POST' && url.pathname === '/link') {
    let raw: unknown;
    try {
      raw = JSON.parse(req.body || '{}');
    } catch {
      return reply(400, { error: 'bad-json' });
    }
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const adapterId = asString(r.adapterId);
    const externalId = asString(r.externalId);
    const patchRaw = asRecordPatch(r.patch);
    if (!adapterId || !externalId || !patchRaw) return reply(400, { error: 'adapterId, externalId and patch are required' });
    await engine.setLink(adapterId, externalId, patchRaw);
    return reply(200, { ok: true });
  }

  // POST /workspace { directories: [absolute paths] } — panel-reported
  // workspace roots for empty-`repos` git-remote discovery (review #4).
  if (req.method === 'POST' && url.pathname === '/workspace') {
    let raw: unknown;
    try {
      raw = JSON.parse(req.body || '{}');
    } catch {
      return reply(400, { error: 'bad-json' });
    }
    try {
      return reply(200, await engine.workspaceSync((raw as { directories?: unknown }).directories));
    } catch (err) {
      return reply(400, { error: err instanceof Error ? err.message : 'bad-directories' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/tasks') {
    let raw: unknown;
    try {
      raw = JSON.parse(req.body || '{}');
    } catch {
      return reply(400, { error: 'bad-json' });
    }
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const adapterId = asString(r.adapterId);
    const title = asString(r.title);
    if (!adapterId || !title) return reply(400, { error: 'adapterId and title are required' });
    const result = await engine.create({
      adapterId,
      projectRef: asString(r.projectRef) ?? null,
      title,
      description: asString(r.description) ?? '',
      labels: asLabels(r.labels),
      listId: asString(r.listId),
    });
    if (result.error) return reply(result.retryable ? 502 : 422, result);
    return reply(201, result);
  }

  // GET /options?adapter=&project= — edit-dialog listings with native ids.
  if (req.method === 'GET' && url.pathname === '/options') {
    const adapter = url.searchParams.get('adapter');
    const project = url.searchParams.get('project');
    if (!adapter || !project) return reply(400, { error: 'adapter and project are required' });
    try {
      return reply(200, await engine.options(adapter, project));
    } catch (err) {
      const retryable = err instanceof AdapterError ? err.retryable : true;
      return reply(retryable ? 502 : 422, { error: err instanceof Error ? err.message : String(err), retryable });
    }
  }

  // POST /tasks/:adapter/:id/destroy — true delete on the source (the
  // plain DELETE route is "remove from board / clear link" — never mixed).
  // Before the patchMatch block: `(.+)$` would swallow the /destroy suffix.
  const destroyMatch = url.pathname.match(/^\/tasks\/([^/]+)\/(.+)\/destroy$/);
  if (req.method === 'POST' && destroyMatch) {
    let adapterId: string;
    let id: string;
    try {
      adapterId = decodeURIComponent(destroyMatch[1] ?? '');
      id = decodeURIComponent(destroyMatch[2] ?? '');
    } catch {
      return reply(400, { error: 'bad-id' });
    }
    try {
      return reply(200, await engine.destroy(adapterId, id));
    } catch (err) {
      const retryable = err instanceof AdapterError ? err.retryable : false;
      return reply(retryable ? 502 : err instanceof AdapterError && err.notFound ? 404 : 422,
        { error: err instanceof Error ? err.message : String(err), retryable });
    }
  }

  const patchMatch = url.pathname.match(/^\/tasks\/([^/]+)\/(.+)$/);
  if (req.method === 'DELETE' && patchMatch) {
    let adapterId: string;
    let id: string;
    try {
      adapterId = decodeURIComponent(patchMatch[1] ?? '');
      id = decodeURIComponent(patchMatch[2] ?? '');
    } catch {
      return reply(400, { error: 'bad-id' });
    }
    return reply(200, await engine.deleteTask(adapterId, id));
  }
  if (req.method === 'PATCH' && patchMatch) {
    let adapterId: string;
    let id: string;
    try {
      adapterId = decodeURIComponent(patchMatch[1] ?? '');
      id = decodeURIComponent(patchMatch[2] ?? '');
    } catch {
      return reply(400, { error: 'bad-id' });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(req.body || '{}');
    } catch {
      return reply(400, { error: 'bad-json' });
    }
    const patch = sanitizePatch(raw);
    if (!patch) return reply(400, { error: 'empty or invalid patch' });
    const result = await engine.patch(adapterId, id, patch);
    if (result.error) return reply(result.retryable ? 502 : 422, result);
    return reply(200, result);
  }

  return reply(404, { error: 'not-found' });
};
