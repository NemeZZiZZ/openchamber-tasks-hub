// GitLab adapter (service-side Issues API; issues + work items, issue_type
// preserved). Columns are label-backed board lists: move = add/remove list
// label; Done additionally closes, leaving Done reopens. externalId =
// `<path>#<iid>`.
import { toListId, toWritePatch, statusForListId } from '../domain/statusMap.ts';
import {
  AdapterError, makeRepoKey, parseRepoKey,
  type AdapterOptions, type Ctx, type NewTask, type RemoteTask, type Scope, type TaskAdapter,
} from './types.ts';
import { asRecord } from './json.ts';
import { checklistProgress } from '../domain/checklist.ts';
import { resolveToken } from '../service/auth.ts';

const PUBLIC_HOST = 'gitlab.com';

const encPath = (path: string): string => encodeURIComponent(path);

const labelsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : [];

// The host rides in the id only off the public host: `group/proj#12` on
// gitlab.com, `git.example.com/group/proj#12` on self-hosted. Without it
// splitId resolves every self-hosted issue to gitlab.com (pre-publish
// review): the token and the request would go to the wrong host.
// (Old self-hosted rows were broken the same way, so nothing working is
// orphaned by the shape change.)
const qualifiedId = (host: string, path: string, iid: number | string): string =>
  host === PUBLIC_HOST ? `${path}#${iid}` : `${host}/${path}#${iid}`;

const mapIssue = (raw: unknown, host: string, path: string): RemoteTask | null => {
  const issue = asRecord(raw);
  if (!issue) return null;
  const iid = issue.iid;
  if (typeof iid !== 'number' && typeof iid !== 'string') return null;
  if (Number(iid) <= 0) return null;
  if (typeof issue.title !== 'string') return null;
  const state = issue.state === 'closed' ? 'closed' : 'opened';
  const labels = labelsOf(issue.labels);
  const listId = toListId('gitlab', { state, labels });
  const url = typeof issue.web_url === 'string' ? issue.web_url : null;
  const iso = typeof issue.updated_at === 'string' ? Date.parse(issue.updated_at) : NaN;
  const assignee = asRecord(issue.assignee);
  const type = typeof issue.issue_type === 'string' ? issue.issue_type : undefined;
  const author = asRecord(issue.author);
  const milestone = asRecord(issue.milestone);
  const completion = asRecord(issue.task_completion_status);
  const description = typeof issue.description === 'string' ? issue.description : '';
  const total = completion && typeof completion.count === 'number' ? completion.count : 0;
  const doneCount = completion && typeof completion.completed_count === 'number' ? completion.completed_count : 0;
  // dueDate is the issue's own editable field. A milestone due date is only
  // metadata: using it as a fallback makes clearing issue.due_date look like
  // it failed whenever the milestone has a date.
  const due = typeof issue.due_date === 'string' ? issue.due_date : null;
  return {
    author: author && typeof author.username === 'string' ? author.username : null,
    closed: state === 'closed',
    milestone: milestone && typeof milestone.title === 'string' ? milestone.title : null,
    dueDate: due,
    comments: typeof issue.user_notes_count === 'number' ? issue.user_notes_count : 0,
    checklist: total > 0 ? { done: doneCount, total } : checklistProgress(description),
    externalId: qualifiedId(host, path, iid),
    url,
    title: issue.title,
    description: typeof issue.description === 'string' ? issue.description : '',
    listId,
    status: statusForListId('gitlab', listId),
    projectRef: makeRepoKey('gitlab', host, path, PUBLIC_HOST),
    assignee: assignee && typeof assignee.username === 'string' ? assignee.username : null,
    labels,
    updatedAt: Number.isFinite(iso) ? iso : 0,
    issueType: type,
  };
};

// One API call against a specific host. 404 → null; 401/403 → not
// retryable; 429/5xx → retryable.
const gl = async (
  ctx: Ctx, method: string, base: string, path: string, token: string, body?: unknown,
): Promise<unknown | null> => {
  let res: Awaited<ReturnType<Ctx['fetch']>>;
  try {
    res = await ctx.fetch(`${base}/api/v4/${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'PRIVATE-TOKEN': token,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AdapterError(`GitLab network error: ${(err as Error).message}`, true);
  }
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new AdapterError(`GitLab auth failed (${res.status})`, false);
  if (res.status >= 400) throw new AdapterError(`GitLab API ${res.status}`, res.status === 429 || res.status >= 500);
  const out = await res.json().catch(() => null);
  if (out === null) throw new AdapterError('GitLab returned a malformed payload', true);
  return out;
};

// Token per host: gitlab.com and any self-hosted server the store knows,
// or the card's gitlab-server + gitlab-token (ci-hub resolveToken order).
const tokenFor = async (ctx: Ctx, host: string): Promise<string> => {
  const resolved = await resolveToken(ctx.auth, gitlabAdapter, host);
  if (resolved.source === null) throw new AdapterError(resolved.message, false, false, true);
  return resolved.token;
};

const splitId = (id: string): { host: string; path: string; iid: string } => {
  const at = id.lastIndexOf('#');
  if (at <= 0 || at === id.length - 1) throw new AdapterError(`bad GitLab task id: ${id}`, false);
  const iid = id.slice(at + 1);
  // The iid goes into the URL path raw: only digits survive.
  if (!/^\d+$/.test(iid)) throw new AdapterError(`bad GitLab task id: ${id}`, false);
  const repo = id.slice(0, at);
  const ref = parseRepoKey(`gitlab:${repo}`, PUBLIC_HOST);
  if (!ref || !ref.path) throw new AdapterError(`bad GitLab repo in id: ${id}`, false);
  return { host: ref.host, path: ref.path, iid };
};

// Native GitLab ids are numeric (assignee user id, milestone id). The cast
// is guarded: JSON.stringify turns NaN into null, and milestone_id reads
// null as "clear" — a non-numeric id must fail loudly, not wipe the field.
const toNumericId = (value: string): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new AdapterError(`GitLab native id is not numeric: ${value}`, false);
  return n;
};

export const gitlabAdapter: TaskAdapter = {
  id: 'gitlab',
  label: 'GitLab',
  storeKey: 'gitlab',
  publicHosts: [PUBLIC_HOST],
  cli: { program: 'glab', tokenArgs: (host) => ['config', 'get', 'token', '--host', host] },
  settingKey: 'gitlab-token',
  serverSetting: 'gitlab-server',

  async list(ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
    const out: RemoteTask[] = [];
    const tokens = new Map<string, string>();
    for (const key of scope.repos) {
      const ref = parseRepoKey(key, PUBLIC_HOST);
      if (!ref || !ref.path || !key.startsWith('gitlab:')) continue;
      let token = tokens.get(ref.host);
      if (token === undefined) {
        token = await tokenFor(ctx, ref.host);
        tokens.set(ref.host, token);
      }
      const params = new URLSearchParams({ state: 'all', per_page: '100' });
      if (scope.assignee === 'me') params.set('scope', 'assigned-to-me');
      const issues = await gl(ctx, 'GET', `https://${ref.host}`, `projects/${encPath(ref.path)}/issues?${params}`, token);
      if (Array.isArray(issues)) {
        for (const raw of issues) {
          const task = mapIssue(raw, ref.host, ref.path);
          if (task) out.push(task);
        }
      }
    }
    return out;
  },

  async get(ctx: Ctx, id: string): Promise<RemoteTask | null> {
    const { host, path, iid } = splitId(id);
    const token = await tokenFor(ctx, host);
    const issue = await gl(ctx, 'GET', `https://${host}`, `projects/${encPath(path)}/issues/${iid}`, token);
    return issue ? mapIssue(issue, host, path) : null;
  },

  async create(ctx: Ctx, input: NewTask): Promise<string> {
    const ref = input.projectRef ? parseRepoKey(input.projectRef, PUBLIC_HOST) : null;
    if (!ref || !ref.path || !input.projectRef?.startsWith('gitlab:')) {
      throw new AdapterError('create needs a projectRef like gitlab:group/project', false);
    }
    const token = await tokenFor(ctx, ref.host);
    const payload: Record<string, unknown> = { title: input.title, description: input.description };
    if (input.labels && input.labels.length > 0) payload.labels = input.labels.join(',');
    const created = await gl(ctx, 'POST', `https://${ref.host}`, `projects/${encPath(ref.path)}/issues`, token, payload);
    const iid: unknown = asRecord(created)?.iid;
    if (typeof iid !== 'number' && typeof iid !== 'string') throw new AdapterError('GitLab create returned no iid', true);
    // Composite id: the same shape this adapter's own get()/splitId read.
    return qualifiedId(ref.host, ref.path, iid);
  },

  // Move = add/remove the board-list label (other labels survive natively
  // via add_labels/remove_labels); Done also closes, leaving Done reopens.
  // fromListId comes from the UI or is filled by the engine (defaults open).
  async update(ctx: Ctx, id: string, patch): Promise<void> {
    const { host, path, iid } = splitId(id);
    const token = await tokenFor(ctx, host);
    const write = toWritePatch(
      'gitlab',
      patch?.fromListId ?? 'open',
      patch?.listId ?? (patch?.fromListId ?? 'open'),
      [],
    );
    const body: Record<string, unknown> = {};
    if (typeof patch?.title === 'string') body.title = patch.title;
    if (typeof patch?.description === 'string') body.description = patch.description;
    if (Array.isArray(patch?.labels)) body.labels = patch.labels;
    // Lifecycle field edits (null clears each). assignee_id(s) is the
    // numeric user id; milestone_id the numeric milestone id; due_date is
    // ISO yyyy-mm-dd or null.
    if (patch?.assigneeId !== undefined) body.assignee_ids = patch.assigneeId ? [toNumericId(patch.assigneeId)] : [];
    if (patch?.milestoneId !== undefined) body.milestone_id = patch.milestoneId === null ? null : toNumericId(patch.milestoneId);
    if (patch?.dueDate !== undefined) body.due_date = patch.dueDate;
    if (write.close) body.state_event = 'close';
    else if (write.reopen) body.state_event = 'reopen';
    const add = [...new Set([...write.addLabels, ...(patch?.addLabels ?? [])])];
    const remove = [...new Set([...write.removeLabels, ...(patch?.removeLabels ?? [])])];
    if (add.length > 0) body.add_labels = add.join(',');
    if (remove.length > 0) body.remove_labels = remove.join(',');
    if (Object.keys(body).length === 0) return;
    await gl(ctx, 'PUT', `https://${host}`, `projects/${encPath(path)}/issues/${iid}`, token, body);
  },

  capabilities: {
    create: true,
    delete: true,
    fields: { assignee: true, milestone: true, dueDate: true, labels: true },
  },

  // gl() maps both 404 and an empty 204 to null, so delete does its own
  // fetch: the engine treats notFound as idempotent success.
  async delete(ctx: Ctx, id: string): Promise<void> {
    const { host, path, iid } = splitId(id);
    const token = await tokenFor(ctx, host);
    let res: Awaited<ReturnType<Ctx['fetch']>>;
    try {
      res = await ctx.fetch(`https://${host}/api/v4/projects/${encPath(path)}/issues/${iid}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', 'PRIVATE-TOKEN': token },
      });
    } catch (err) {
      throw new AdapterError(`GitLab network error: ${(err as Error).message}`, true);
    }
    if (res.status === 404) throw new AdapterError(`GitLab issue ${id} not found`, false, true);
    if (res.status === 401 || res.status === 403) throw new AdapterError(`GitLab auth failed (${res.status})`, false);
    if (res.status >= 400) throw new AdapterError(`GitLab API ${res.status}`, res.status === 429 || res.status >= 500);
  },

  async options(ctx: Ctx, projectRef: string): Promise<AdapterOptions> {
    const ref = parseRepoKey(projectRef, PUBLIC_HOST);
    if (!ref || !ref.path || !projectRef.startsWith('gitlab:')) {
      throw new AdapterError('options need a projectRef like gitlab:group/project', false);
    }
    const token = await tokenFor(ctx, ref.host);
    const base = `https://${ref.host}`;
    const [members, milestones, labels] = await Promise.all([
      gl(ctx, 'GET', base, `projects/${encPath(ref.path)}/members/all?per_page=100`, token),
      gl(ctx, 'GET', base, `projects/${encPath(ref.path)}/milestones?state=active&per_page=100`, token),
      gl(ctx, 'GET', base, `projects/${encPath(ref.path)}/labels?per_page=100`, token),
    ]);
    const pick = (rows: unknown, read: (r: Record<string, unknown>) => { id: string; name: string } | null) =>
      (Array.isArray(rows) ? rows : [])
        .map((r) => asRecord(r))
        .filter((r): r is Record<string, unknown> => r !== null)
        .map(read)
        .filter((v): v is { id: string; name: string } => v !== null);
    return {
      // Name = username: list() maps assignee.username, so the select must
      // match it (full names never match the row and picking one would
      // mint a synthetic member whose id is a username → guaranteed 422).
      people: pick(members, (r) => typeof r.id === 'number' || typeof r.id === 'string'
        ? { id: String(r.id), name: typeof r.username === 'string' ? r.username : String(r.name ?? r.id) } : null),
      milestones: pick(milestones, (r) => (typeof r.id === 'number' || typeof r.id === 'string') && typeof r.title === 'string'
        ? { id: String(r.id), name: r.title } : null),
      labels: pick(labels, (r) => typeof r.name === 'string' ? { id: r.name, name: r.name } : null).map((l) => l.name),
    };
  },
};
