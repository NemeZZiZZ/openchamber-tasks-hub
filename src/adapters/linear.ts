// Linear adapter (service-side GraphQL). Columns = workflow states
// (state.id passthrough as listId). Auth: settings-only `linear-token`
// (API key) as a bearer. externalId = `<teamKey>#<identifier>` (APP-12).
import { toListId, statusForListId } from '../domain/statusMap.ts';
import { AdapterError, type AdapterOptions, type Ctx, type NewTask, type RemoteTask, type Scope, type TaskAdapter } from './types.ts';
import { asRecord } from './json.ts';

const API = 'https://api.linear.app/graphql';

const mapIssue = (raw: unknown, team: string): RemoteTask | null => {
  const node = asRecord(raw);
  if (!node || typeof node.identifier !== 'string' || typeof node.title !== 'string') return null;
  const state = asRecord(node.state);
  const listId = state && typeof state.id === 'string' ? state.id : 'open';
  const iso = typeof node.updatedAt === 'string' ? Date.parse(node.updatedAt) : NaN;
  const assignee = asRecord(node.assignee);
  const labelNodes = asRecord(node.labels)?.nodes;
  const labels = Array.isArray(labelNodes)
    ? labelNodes.map((l) => asRecord(l)?.name).filter((n): n is string => typeof n === 'string')
    : [];
  return {
    externalId: `${team}#${node.identifier}`,
    url: typeof node.url === 'string' ? node.url : null,
    title: node.title,
    description: typeof node.description === 'string' ? node.description : '',
    listId: toListId('linear', { listId }),
    status: statusForListId('linear', listId),
    projectRef: `linear:${team}`,
    assignee: assignee && typeof assignee.name === 'string' ? assignee.name : null,
    dueDate: typeof node.dueDate === 'string' ? node.dueDate : null,
    labels,
    updatedAt: Number.isFinite(iso) ? iso : 0,
    nativeId: typeof node.id === 'string' ? node.id : undefined,
  };
};

export const linearAdapter: TaskAdapter = {
  id: 'linear',
  label: 'Linear',
  storeKey: null,
  publicHosts: ['linear.app'],
  settingKey: 'linear-token',

  async list(ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
    const token = await tokenFor(ctx);
    const out: RemoteTask[] = [];
    for (const repo of scope.repos) {
      if (!repo.startsWith('linear:')) continue;
      const team = repo.slice('linear:'.length);
      if (!team) continue;
      const result = await gqlCall(ctx, token, `
        query($team: String!) { issues(filter: { team: { key: { eq: $team } } }, first: 100) {
          nodes { id identifier title description url updatedAt dueDate
                  state { id name } assignee { name } labels { nodes { name } } }
        } }`, { team });
      const nodes = asRecord(asRecord(result)?.issues)?.nodes;
      if (Array.isArray(nodes)) for (const raw of nodes) {
        const task = mapIssue(raw, team);
        if (task) out.push(task);
      }
    }
    return out;
  },

  async get(ctx: Ctx, id: string): Promise<RemoteTask | null> {
    const token = await tokenFor(ctx);
    const { team, identifier } = parseId(id);
    const found = await searchIssue(ctx, token, identifier);
    return found ? mapIssue(found, team) : null;
  },

  async create(ctx: Ctx, input: NewTask): Promise<string> {
    const token = await tokenFor(ctx);
    const team = input.projectRef?.startsWith('linear:') ? input.projectRef.slice('linear:'.length) : null;
    if (!team) throw new AdapterError('create needs a projectRef like linear:<teamKey>', false);
    const teams = await gqlCall(ctx, token, `query($key: String!) { teams(filter: { key: { eq: $key } }, first: 1) { nodes { id } } }`, { key: team });
    const teamId = asRecord(Array.isArray(asRecord(asRecord(teams)?.teams)?.nodes) ? (asRecord(asRecord(teams)?.teams)?.nodes as unknown[])[0] : null)?.id;
    if (typeof teamId !== 'string') throw new AdapterError(`Linear team ${team} not found`, false);
    const created = await gqlCall(ctx, token, `
      mutation($input: IssueCreateInput!) { issueCreate(input: $input) {
        success issue { id identifier }
      } }`, { input: { teamId, title: input.title, description: input.description } });
    const issue = asRecord(asRecord(created)?.issueCreate)?.issue;
    // Only a readable composite id leaves create(): a bare uuid would break
    // get() (review #2).
    const identifier = asRecord(issue)?.identifier;
    if (typeof identifier === 'string') return `${team}#${identifier}`;
    throw new AdapterError('Linear create returned no issue identifier', true);
  },

  async update(ctx: Ctx, id: string, patch): Promise<void> {
    const { token, uuid } = await splitId(ctx, id);
    const input: Record<string, unknown> = {};
    if (typeof patch?.title === 'string') input.title = patch.title;
    if (typeof patch?.description === 'string') input.description = patch.description;
    if (typeof patch?.listId === 'string' && patch.listId !== (patch.fromListId ?? '')) input.stateId = patch.listId;
    // Lifecycle field edits: null clears assignee/dueDate; label names are
    // resolved against the team's issueLabels (issueUpdate takes uuids).
    if (patch?.assigneeId !== undefined) input.assigneeId = patch.assigneeId;
    if (patch?.dueDate !== undefined) input.dueDate = patch.dueDate;
    if (Array.isArray(patch?.labels) || patch?.addLabels?.length || patch?.removeLabels?.length) {
      const team = parseId(id).team;
      const result = await gqlCall(ctx, token, `
        query($key: String!) { teams(filter: { key: { eq: $key } }, first: 1) { nodes {
          issueLabels { nodes { id name } }
        } } }`, { key: team });
      const node = (Array.isArray(asRecord(asRecord(result)?.teams)?.nodes)
        ? (asRecord(asRecord(result)?.teams)?.nodes as unknown[])[0] : null);
      const labelNodes = asRecord(asRecord(node)?.issueLabels)?.nodes;
      const byName = new Map<string, string>();
      if (Array.isArray(labelNodes)) {
        for (const raw of labelNodes) {
          const label = asRecord(raw);
          if (typeof label?.id === 'string' && typeof label?.name === 'string') byName.set(label.name, label.id);
        }
      }
      const current = patch?.labels ?? null;
      let names: string[];
      if (current !== null) {
        names = current;
      } else {
        const found = await searchIssue(ctx, token, parseId(id).identifier);
        const labelNodes = asRecord(asRecord(found)?.labels)?.nodes;
        const currentNames = (Array.isArray(labelNodes) ? labelNodes : [])
          .map((l) => asRecord(l)?.name)
          .filter((n): n is string => typeof n === 'string');
        const drop = new Set(patch?.removeLabels ?? []);
        names = currentNames.filter((n) => !drop.has(n));
        for (const n of patch?.addLabels ?? []) if (!names.includes(n)) names.push(n);
      }
      const unknown = names.filter((n) => !byName.has(n));
      if (unknown.length > 0) throw new AdapterError(`Linear team has no labels: ${unknown.join(', ')}`, false);
      input.labelIds = names.map((n) => byName.get(n) as string);
    }
    if (Object.keys(input).length === 0) return;
    await gqlCall(ctx, token, `
      mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
      { id: uuid, input });
  },

  capabilities: {
    create: true,
    delete: true,
    fields: { assignee: true, milestone: false, dueDate: true, labels: true },
  },

  async delete(ctx: Ctx, id: string): Promise<void> {
    const { token, uuid } = await splitId(ctx, id);
    const result = await gqlCall(ctx, token,
      `mutation($id: String!) { issueDelete(id: $id) { success } }`, { id: uuid });
    if (asRecord(asRecord(result)?.issueDelete)?.success !== true) {
      throw new AdapterError(`Linear issueDelete failed for ${id}`, true);
    }
  },

  // One team query feeds the whole edit dialog: members (uuid = native id)
  // and team-scoped issue labels (name→uuid needed by label writes).
  async options(ctx: Ctx, projectRef: string): Promise<AdapterOptions> {
    const team = projectRef?.startsWith('linear:') ? projectRef.slice('linear:'.length) : null;
    if (!team) throw new AdapterError('options need a projectRef like linear:<teamKey>', false);
    const token = await tokenFor(ctx);
    const result = await gqlCall(ctx, token, `
      query($key: String!) { teams(filter: { key: { eq: $key } }, first: 1) { nodes {
        members { nodes { id name displayName } }
        issueLabels { nodes { id name } }
      } } }`, { key: team });
    const node = (Array.isArray(asRecord(asRecord(result)?.teams)?.nodes)
      ? (asRecord(asRecord(result)?.teams)?.nodes as unknown[])[0] : null);
    const members = asRecord(asRecord(node)?.members)?.nodes;
    const labels = asRecord(asRecord(node)?.issueLabels)?.nodes;
    // Name the BOARD uses (mapIssue reads assignee.name) so the select
    // matches the row; displayName is only a fallback.
    const people = (Array.isArray(members) ? members : [])
      .map((m) => asRecord(m))
      .filter((m): m is Record<string, unknown> => m !== null && typeof m.id === 'string')
      .map((m) => ({ id: m.id as string, name: typeof m.name === 'string' && m.name ? m.name : (typeof m.displayName === 'string' ? m.displayName : String(m.id)) }));
    const labelNames = (Array.isArray(labels) ? labels : [])
      .map((l) => asRecord(l))
      .filter((l): l is Record<string, unknown> => l !== null && typeof l.name === 'string')
      .map((l) => ({ id: l.id as string, name: l.name as string }));
    return { people, milestones: [], labels: labelNames.map((l) => l.name) };
  },
};

const tokenFor = async (ctx: Ctx): Promise<string> => {
  const token = (await ctx.settings('linear-token'))?.trim();
  if (!token) throw new AdapterError('No Linear credentials. Paste linear-token on the Tasks card.', false, false, true);
  return token;
};

// Lookup by human identifier goes through issueSearch: IssueFilter has no
// documented identifier field, and guessing the schema fails silently.
// The search returns the uuid mutations need (plus the fields get maps).
const searchIssue = async (ctx: Ctx, token: string, identifier: string): Promise<unknown | null> => {
  const result = await gqlCall(ctx, token, `
    query($q: String!) { issueSearch(query: $q) { nodes {
      ... on Issue { id identifier title description url updatedAt dueDate
        state { id name } assignee { name } labels { nodes { name } } }
    } } }`, { q: identifier });
  const nodes = asRecord(asRecord(result)?.issueSearch)?.nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes.find((raw) => asRecord(raw)?.identifier === identifier) ?? null;
};

// `APP#APP-1` carries the human identifier; mutations need the uuid, which
// only a lookup by identifier returns — resolve it first (without going
// through get() itself: it shares this parse but never this resolver).
const parseId = (id: string): { team: string; identifier: string } => {
  const at = id.lastIndexOf('#');
  if (at <= 0 || at === id.length - 1) throw new AdapterError(`bad Linear task id: ${id}`, false);
  return { team: id.slice(0, at), identifier: id.slice(at + 1) };
};

const splitId = async (ctx: Ctx, id: string): Promise<{ token: string; team: string; identifier: string; uuid: string }> => {
  const token = await tokenFor(ctx);
  const { team, identifier } = parseId(id);
  if (!identifier.includes('-')) return { token, team, identifier, uuid: identifier }; // already a uuid
  const found = await searchIssue(ctx, token, identifier);
  const uuid = asRecord(found)?.id;
  if (typeof uuid !== 'string') throw new AdapterError(`Linear issue ${identifier} not found`, false, true);
  return { token, team, identifier, uuid };
};

const gqlCall = async (
  ctx: Ctx, token: string, query: string, variables: Record<string, unknown>,
): Promise<unknown | null> => {
  let res: Awaited<ReturnType<Ctx['fetch']>>;
  try {
    res = await ctx.fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ query: query.trim(), variables }),
    });
  } catch (err) {
    throw new AdapterError(`Linear network error: ${(err as Error).message}`, true);
  }
  if (res.status === 401 || res.status === 403) throw new AdapterError(`Linear auth failed (${res.status})`, false);
  if (res.status >= 400) throw new AdapterError(`Linear API ${res.status}`, res.status === 429 || res.status >= 500);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw new AdapterError('Linear returned a malformed payload', true);
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const first = asRecord(body.errors[0]);
    const code = first?.extensions && asRecord(first.extensions)?.code;
    const message = typeof first?.message === 'string' ? first.message : 'unknown GraphQL error';
    throw new AdapterError(`Linear GraphQL: ${message}${code ? ` (${String(code)})` : ''}`, code !== 'AUTH' && code !== 'BAD_USER_INPUT');
  }
  return body.data ?? null;
};
