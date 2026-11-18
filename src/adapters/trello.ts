// Trello adapter (service-side REST). Cards on a board; listId = the
// Trello list id (native columns, passthrough). No close/reopen semantics
// (plan Task 9). Auth: settings-only `trello-key` + `trello-token` pair,
// sent as query params. externalId = `<boardId>#<cardId>`.
import { toListId, statusForListId } from '../domain/statusMap.ts';
import { AdapterError, type AdapterOptions, type Ctx, type NewTask, type RemoteTask, type Scope, type TaskAdapter } from './types.ts';
import { asRecord } from './json.ts';

const API = 'https://api.trello.com/1';

const mapCard = (raw: unknown, boardId: string): RemoteTask | null => {
  const c = asRecord(raw);
  if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') return null;
  const iso = typeof c.dateLastActivity === 'string' ? Date.parse(c.dateLastActivity) : NaN;
  const labels = Array.isArray(c.labels)
    ? c.labels.map((l) => asRecord(l)?.name).filter((n): n is string => typeof n === 'string')
    : [];
  // First member = the displayed assignee (options() people use the same
  // fullName||username so the select matches the row); no members → null.
  const members = Array.isArray(c.members) ? c.members : [];
  const first = asRecord(members[0]);
  const assignee = first
    ? (typeof first.fullName === 'string' && first.fullName
      ? first.fullName
      : (typeof first.username === 'string' ? first.username : null))
    : null;
  const listId = typeof c.idList === 'string' ? c.idList : 'open';
  return {
    externalId: `${boardId}#${c.id}`,
    url: typeof c.url === 'string' ? c.url : null,
    title: c.name,
    description: typeof c.desc === 'string' ? c.desc : '',
    listId,
    status: statusForListId('trello', listId),
    projectRef: `trello:${boardId}`,
    assignee,
    dueDate: typeof c.due === 'string' ? c.due : null,
    labels,
    updatedAt: Number.isFinite(iso) ? iso : 0,
  };
};

export const trelloAdapter: TaskAdapter = {
  id: 'trello',
  label: 'Trello',
  storeKey: null,
  publicHosts: ['trello.com'],
  settingKey: 'trello-token',
  authSetting: 'trello-key',

  async list(ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
    const { key, token } = await credentialsFor(ctx);
    const out: RemoteTask[] = [];
    for (const repo of scope.repos) {
      if (!repo.startsWith('trello:')) continue;
      const boardId = repo.slice('trello:'.length);
      if (!boardId) continue;
      // members=true so mapCard can show the card's assignee.
      const cards = await call(ctx, 'GET', `/boards/${encodeURIComponent(boardId)}/cards?members=true`, key, token);
      if (Array.isArray(cards)) for (const raw of cards) {
        const task = mapCard(raw, boardId);
        if (task) out.push(task);
      }
    }
    return out;
  },

  async get(ctx: Ctx, id: string): Promise<RemoteTask | null> {
    const { key, token, boardId, cardId } = await splitId(ctx, id);
    // members=true (same as list) so the assignee maps after an edit round-trip.
    const card = await call(ctx, 'GET', `/cards/${encodeURIComponent(cardId)}?members=true`, key, token);
    return card ? mapCard(card, boardId) : null;
  },

  async create(ctx: Ctx, input: NewTask): Promise<string> {
    const { key, token } = await credentialsFor(ctx);
    const ref = input.projectRef?.startsWith('trello:') ? input.projectRef.slice('trello:'.length) : null;
    if (!ref) throw new AdapterError('create needs a projectRef like trello:<boardId>', false);
    const lists = await call(ctx, 'GET', `/boards/${encodeURIComponent(ref)}/lists`, key, token);
    const first = Array.isArray(lists) ? asRecord(lists[0]) : null;
    const idList = typeof first?.id === 'string' ? first.id : null;
    if (!idList) throw new AdapterError('Trello board has no lists to create a card in', false);
    const created = await call(ctx, 'POST', `/cards?idList=${encodeURIComponent(idList)}&name=${encodeURIComponent(input.title)}&desc=${encodeURIComponent(input.description)}`, key, token);
    const id = asRecord(created)?.id;
    if (typeof id !== 'string') throw new AdapterError('Trello create returned no card id', true);
    if (input.labels && input.labels.length > 0) {
      await setCardLabels(ctx, key, token, ref, id, input.labels, [], []);
    }
    // Composite id: the same shape this adapter's own get()/splitId read.
    return `${ref}#${id}`;
  },

  async update(ctx: Ctx, id: string, patch): Promise<void> {
    const { key, token, boardId, cardId } = await splitId(ctx, id);
    const params = new URLSearchParams();
    if (typeof patch?.title === 'string') params.set('name', patch.title);
    if (typeof patch?.description === 'string') params.set('desc', patch.description);
    if (typeof patch?.listId === 'string' && patch.listId !== (patch.fromListId ?? '')) params.set('idList', patch.listId);
    // Lifecycle field edits: the literal string 'null' clears Trello's due
    // date; idMembers replaces the member set, so clearing removes the
    // card's current members one by one (no bulk-clear endpoint).
    if (patch?.dueDate !== undefined) params.set('due', patch.dueDate ?? 'null');
    if (patch?.assigneeId !== undefined) {
      if (patch.assigneeId) {
        params.set('idMembers', patch.assigneeId);
      } else {
        const card = await call(ctx, 'GET', `/cards/${encodeURIComponent(cardId)}?members=true`, key, token);
        const members = asRecord(card)?.members;
        for (const m of Array.isArray(members) ? members : []) {
          const mid = asRecord(m)?.id;
          if (typeof mid === 'string') {
            await call(ctx, 'DELETE', `/cards/${encodeURIComponent(cardId)}/idMembers/${encodeURIComponent(mid)}`, key, token);
          }
        }
      }
    }
    if ([...params.keys()].length > 0) {
      await call(ctx, 'PUT', `/cards/${encodeURIComponent(cardId)}?${params.toString()}`, key, token);
    }
    // idLabels takes label ids, not names: resolve names against the board.
    // Reads the card so add/remove merge with the current set instead of
    // silently replacing it (or reporting success while doing nothing).
    if (Array.isArray(patch?.labels) || patch?.addLabels?.length || patch?.removeLabels?.length) {
      await setCardLabels(ctx, key, token, boardId, cardId, patch?.labels ?? null, patch?.addLabels ?? [], patch?.removeLabels ?? []);
    }
  },

  capabilities: {
    create: true,
    delete: true,
    labelsFromOptions: true,
    fields: { assignee: true, milestone: false, dueDate: true, labels: true },
  },

  // call() cannot distinguish 404 from a null-body 200, so delete fetches
  // directly: the engine treats notFound as idempotent success.
  async delete(ctx: Ctx, id: string): Promise<void> {
    const { key, token, cardId } = await splitId(ctx, id);
    let res: Awaited<ReturnType<Ctx['fetch']>>;
    try {
      res = await ctx.fetch(`${API}/cards/${encodeURIComponent(cardId)}?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      throw new AdapterError(`Trello network error: ${(err as Error).message}`, true);
    }
    if (res.status === 404) throw new AdapterError(`Trello card ${id} not found`, false, true);
    if (res.status === 401 || res.status === 403) throw new AdapterError(`Trello auth failed (${res.status})`, false);
    if (res.status >= 400) throw new AdapterError(`Trello API ${res.status}`, res.status === 429 || res.status >= 500);
  },

  async options(ctx: Ctx, projectRef: string): Promise<AdapterOptions> {
    const boardId = projectRef?.startsWith('trello:') ? projectRef.slice('trello:'.length) : null;
    if (!boardId) throw new AdapterError('options need a projectRef like trello:<boardId>', false);
    const { key, token } = await credentialsFor(ctx);
    const [members, labels] = await Promise.all([
      call(ctx, 'GET', `/boards/${encodeURIComponent(boardId)}/members?limit=100`, key, token),
      call(ctx, 'GET', `/boards/${encodeURIComponent(boardId)}/labels?limit=1000`, key, token),
    ]);
    const people = (Array.isArray(members) ? members : [])
      .map((m) => asRecord(m))
      .filter((m): m is Record<string, unknown> => m !== null && typeof m.id === 'string')
      .map((m) => ({ id: m.id as string, name: typeof m.fullName === 'string' && m.fullName ? m.fullName : String(m.username ?? m.id) }));
    // Unnamed color labels exist on every board; they are unusable as text
    // options, so skip them.
    const names = (Array.isArray(labels) ? labels : [])
      .map((l) => asRecord(l))
      .filter((l): l is Record<string, unknown> => l !== null && typeof l.name === 'string' && l.name.length > 0)
      .map((l) => l.name as string);
    return { people, milestones: [], labels: names };
  },
};

// Label names → board label ids. `names` replaces the set when non-null;
// otherwise add/remove merge with the card's current label names.
const setCardLabels = async (
  ctx: Ctx, key: string, token: string, boardId: string, cardId: string,
  names: string[] | null, add: string[], remove: string[],
): Promise<void> => {
  const boardLabels = await call(ctx, 'GET', `/boards/${encodeURIComponent(boardId)}/labels?limit=1000`, key, token);
  const byName = new Map<string, string>();
  if (Array.isArray(boardLabels)) {
    for (const raw of boardLabels) {
      const label = asRecord(raw);
      if (typeof label?.id === 'string' && typeof label?.name === 'string' && label.name) {
        if (!byName.has(label.name)) byName.set(label.name, label.id);
      }
    }
  }
  let next: string[];
  if (names !== null) {
    next = names;
  } else {
    const card = await call(ctx, 'GET', `/cards/${encodeURIComponent(cardId)}?labels=true&labelNames=true`, key, token);
    const current = asRecord(card)?.labels;
    const currentNames = Array.isArray(current)
      ? current.map((l) => asRecord(l)?.name).filter((n): n is string => typeof n === 'string')
      : [];
    const drop = new Set(remove);
    next = currentNames.filter((n) => !drop.has(n));
    for (const name of add) if (!next.includes(name)) next.push(name);
  }
  const unknown = next.filter((n) => !byName.has(n));
  if (unknown.length > 0) throw new AdapterError(`Trello board has no labels: ${unknown.join(', ')}`, false);
  await call(ctx, 'PUT', `/cards/${encodeURIComponent(cardId)}?idLabels=${next.map((n) => byName.get(n) as string).join(',')}`, key, token);
};

const credentialsFor = async (ctx: Ctx): Promise<{ key: string; token: string }> => {
  const key = (await ctx.settings('trello-key'))?.trim();
  const token = (await ctx.settings('trello-token'))?.trim();
  if (!key || !token) {
    throw new AdapterError('No Trello credentials. Paste trello-key and trello-token on the Tasks card.', false, false, true);
  }
  return { key, token };
};

const splitId = async (ctx: Ctx, id: string): Promise<{ key: string; token: string; boardId: string; cardId: string }> => {
  const at = id.lastIndexOf('#');
  if (at <= 0 || at === id.length - 1) throw new AdapterError(`bad Trello task id: ${id}`, false);
  const credentials = await credentialsFor(ctx);
  return { ...credentials, boardId: id.slice(0, at), cardId: id.slice(at + 1) };
};

const call = async (
  ctx: Ctx, method: string, path: string, key: string, token: string,
): Promise<unknown | null> => {
  let res: Awaited<ReturnType<Ctx['fetch']>>;
  try {
    res = await ctx.fetch(`${API}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`, {
      method,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    throw new AdapterError(`Trello network error: ${(err as Error).message}`, true);
  }
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new AdapterError(`Trello auth failed (${res.status})`, false);
  if (res.status >= 400) throw new AdapterError(`Trello API ${res.status}`, res.status === 429 || res.status >= 500);
  return await res.json().catch(() => null);
};
