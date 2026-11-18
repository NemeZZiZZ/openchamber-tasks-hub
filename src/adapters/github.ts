// GitHub adapter (service-side REST, Issues only). PRs are excluded from
// list output; write-back is title/body, state (close/reopen) and explicit
// label replacement. externalId = `owner/repo#number`.
import { toListId, statusForListId } from '../domain/statusMap.ts';
import {
  AdapterError, makeRepoKey, parseRepoKey,
  type AdapterOptions, type Ctx, type NewTask, type RemoteTask, type Scope, type TaskAdapter,
} from './types.ts';
import { asRecord } from './json.ts';
import { checklistProgress } from '../domain/checklist.ts';
import { resolveToken } from '../service/auth.ts';

const PUBLIC_HOST = 'github.com';
const API_ORIGIN = 'https://api.github.com';

const labelsOf = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const record = asRecord(entry);
      const name = record ? record.name : entry;
      return typeof name === 'string' ? name : null;
    })
    .filter((name): name is string => name !== null);
};

// Defensive mapper: anything malformed → null, caller skips the entry.
const mapIssue = (raw: unknown, path: string): RemoteTask | null => {
  const issue = asRecord(raw);
  if (!issue) return null;
  // PRs appear in the issues API; they are non-goal (link-only, later).
  if (issue.pull_request !== undefined) return null;
  const number = issue.number;
  if (typeof number !== 'number' && typeof number !== 'string') return null;
  if (typeof issue.title !== 'string') return null;
  const state = issue.state === 'closed' ? 'closed' : 'open';
  const url = typeof issue.html_url === 'string' ? issue.html_url : null;
  const iso = typeof issue.updated_at === 'string' ? Date.parse(issue.updated_at) : NaN;
  const assignee = asRecord(issue.assignee);
  const author = asRecord(issue.user);
  const milestone = asRecord(issue.milestone);
  const body = typeof issue.body === 'string' ? issue.body : '';
  return {
    author: author && typeof author.login === 'string' ? author.login : null,
    closed: state === 'closed',
    milestone: milestone && typeof milestone.title === 'string' ? milestone.title : null,
    dueDate: milestone && typeof milestone.due_on === 'string' ? milestone.due_on : null,
    comments: typeof issue.comments === 'number' ? issue.comments : 0,
    checklist: checklistProgress(body),
    externalId: `${path}#${number}`,
    url,
    title: issue.title,
    description: typeof issue.body === 'string' ? issue.body : '',
    listId: toListId('github', { state }),
    status: statusForListId('github', toListId('github', { state })),
    projectRef: makeRepoKey('github', PUBLIC_HOST, path, PUBLIC_HOST),
    assignee: assignee && typeof assignee.login === 'string' ? assignee.login : null,
    labels: labelsOf(issue.labels),
    updatedAt: Number.isFinite(iso) ? iso : 0,
  };
};

// One API call. 404 → null; 401/403 → not retryable; 429/5xx → retryable.
const gh = async (
  ctx: Ctx, method: string, url: string, token: string, body?: unknown,
): Promise<unknown | null> => {
  let res: Awaited<ReturnType<Ctx['fetch']>>;
  try {
    res = await ctx.fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AdapterError(`GitHub network error: ${(err as Error).message}`, true);
  }
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new AdapterError(`GitHub auth failed (${res.status})`, false);
  if (res.status >= 400) throw new AdapterError(`GitHub API ${res.status}`, res.status === 429 || res.status >= 500);
  const out = await res.json().catch(() => null);
  if (out === null && method !== 'DELETE') throw new AdapterError('GitHub returned a malformed payload', true);
  return out;
};

const tokenFor = async (ctx: Ctx): Promise<string> => {
  const resolved = await resolveToken(ctx.auth, githubAdapter, PUBLIC_HOST);
  if (resolved.source === null) throw new AdapterError(resolved.message, false, false, true);
  return resolved.token;
};

const splitId = (id: string): { path: string; number: string } => {
  const at = id.lastIndexOf('#');
  if (at <= 0 || at === id.length - 1) throw new AdapterError(`bad GitHub task id: ${id}`, false);
  const number = id.slice(at + 1);
  // The number goes into the URL path raw: only digits survive.
  if (!/^\d+$/.test(number)) throw new AdapterError(`bad GitHub task id: ${id}`, false);
  return { path: id.slice(0, at), number };
};

// "Mine only" needs the login: `filter=assigned` does not exist on the
// repository-issues endpoint (unknown params are ignored, so the filter
// silently showed everything). One GET /user per list call.
const myLogin = async (ctx: Ctx, token: string): Promise<string> => {
  const me = await gh(ctx, 'GET', `${API_ORIGIN}/user`, token);
  const login = asRecord(me)?.login;
  if (typeof login !== 'string' || !login) throw new AdapterError('GitHub /user returned no login', true);
  return login;
};

export const githubAdapter: TaskAdapter = {
  id: 'github',
  label: 'GitHub',
  storeKey: 'github',
  publicHosts: [PUBLIC_HOST],
  cli: { program: 'gh', tokenArgs: () => ['auth', 'token'] },
  settingKey: 'github-token',

  // v1 scope: naive sequential fetch, one page of 100 per repo (design).
  async list(ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
    const token = await tokenFor(ctx);
    const assignee = scope.assignee === 'me' ? await myLogin(ctx, token) : null;
    const out: RemoteTask[] = [];
    for (const key of scope.repos) {
      // A shared scope may carry other providers' keys (workspace
      // discovery, review #4): only github: keys are GitHub repos.
      if (!key.startsWith('github:')) continue;
      const ref = parseRepoKey(key, PUBLIC_HOST);
      if (!ref || ref.host !== PUBLIC_HOST || !ref.path) continue;
      const params = new URLSearchParams({ state: 'all', per_page: '100', sort: 'updated', direction: 'desc' });
      if (assignee) params.set('assignee', assignee);
      const issues = await gh(ctx, 'GET', `${API_ORIGIN}/repos/${ref.path}/issues?${params}`, token);
      if (Array.isArray(issues)) {
        for (const raw of issues) {
          const task = mapIssue(raw, ref.path);
          if (task) out.push(task);
        }
      }
    }
    return out;
  },

  async get(ctx: Ctx, id: string): Promise<RemoteTask | null> {
    const token = await tokenFor(ctx);
    const { path, number } = splitId(id);
    const issue = await gh(ctx, 'GET', `${API_ORIGIN}/repos/${path}/issues/${number}`, token);
    return issue ? mapIssue(issue, path) : null;
  },

  async create(ctx: Ctx, input: NewTask): Promise<string> {
    const token = await tokenFor(ctx);
    const ref = input.projectRef?.startsWith('github:') ? parseRepoKey(input.projectRef, PUBLIC_HOST) : null;
    if (!ref || !ref.path) throw new AdapterError('create needs a projectRef like github:owner/repo', false);
    const payload: Record<string, unknown> = { title: input.title, body: input.description };
    if (input.labels && input.labels.length > 0) payload.labels = input.labels;
    const created = await gh(ctx, 'POST', `${API_ORIGIN}/repos/${ref.path}/issues`, token, payload);
    const number = asRecord(created)?.number;
    if (number === undefined) throw new AdapterError('GitHub create returned no issue number', true);
    // Composite id: the same shape this adapter's own get()/splitId read.
    return `${ref.path}#${number}`;
  },

  // Move = state change (open|done columns); labels are only ever touched
  // by an explicit patch.labels replace, so non-mapping labels survive.
  async update(ctx: Ctx, id: string, patch): Promise<void> {
    const token = await tokenFor(ctx);
    const { path, number } = splitId(id);
    const body: Record<string, unknown> = {};
    if (typeof patch?.title === 'string') body.title = patch.title;
    if (typeof patch?.description === 'string') body.body = patch.description;
    if (Array.isArray(patch?.labels)) {
      body.labels = patch.labels;
    } else if (patch?.addLabels?.length || patch?.removeLabels?.length) {
      // GitHub has no atomic add+remove: read current labels, send the merge.
      const current = await gh(ctx, 'GET', `${API_ORIGIN}/repos/${path}/issues/${number}`, token);
      const drop = new Set(patch.removeLabels ?? []);
      const next = labelsOf(asRecord(current)?.labels).filter((l) => !drop.has(l));
      for (const l of patch.addLabels ?? []) if (!next.includes(l)) next.push(l);
      body.labels = next;
    }
    // Lifecycle field edits: assigneeId carries the login (null clears),
    // milestoneId the milestone number (null clears). patch.dueDate is
    // ignored — GitHub issues have no due date (capability false).
    if (patch?.assigneeId !== undefined) body.assignees = patch.assigneeId ? [patch.assigneeId] : [];
    // Non-numeric milestone ids must fail loudly: JSON.stringify turns NaN
    // into null and GitHub reads that as "clear" — a synthetic dialog entry
    // (closed milestone) would silently wipe the field.
    if (patch?.milestoneId !== undefined) {
      if (patch.milestoneId === null) body.milestone = null;
      else {
        const n = Number(patch.milestoneId);
        if (!Number.isFinite(n) || n <= 0) throw new AdapterError(`bad GitHub milestone id: ${patch.milestoneId}`, false);
        body.milestone = n;
      }
    }
    if (typeof patch?.listId === 'string' && patch.listId !== (patch.fromListId ?? 'open')) {
      body.state = patch.listId === 'done' ? 'closed' : 'open';
    }
    if (Object.keys(body).length === 0) return;
    await gh(ctx, 'PATCH', `${API_ORIGIN}/repos/${path}/issues/${number}`, token, body);
  },

  capabilities: {
    create: true,
    delete: false,
    deleteNote: 'GitHub issues cannot be deleted via the API — use Close instead',
    fields: { assignee: true, milestone: true, dueDate: false, labels: true },
  },
  async delete(_ctx: Ctx, id: string): Promise<void> {
    throw new AdapterError('GitHub issues cannot be deleted via the API — use Close instead', false);
  },

  // Edit-dialog options: repo assignees (login as the native id — PATCH
  // assignees takes logins), open milestones (id = issue number), labels.
  async options(ctx: Ctx, projectRef: string): Promise<AdapterOptions> {
    const token = await tokenFor(ctx);
    const ref = parseRepoKey(projectRef, PUBLIC_HOST);
    if (!ref || !ref.path || !projectRef.startsWith('github:')) {
      throw new AdapterError('options need a projectRef like github:owner/repo', false);
    }
    const [assignees, milestones, labels] = await Promise.all([
      gh(ctx, 'GET', `${API_ORIGIN}/repos/${ref.path}/assignees?per_page=100`, token),
      gh(ctx, 'GET', `${API_ORIGIN}/repos/${ref.path}/milestones?state=open&per_page=100`, token),
      gh(ctx, 'GET', `${API_ORIGIN}/repos/${ref.path}/labels?per_page=100`, token),
    ]);
    const pick = (rows: unknown, read: (r: Record<string, unknown>) => { id: string; name: string } | null) =>
      (Array.isArray(rows) ? rows : [])
        .map((r) => asRecord(r))
        .filter((r): r is Record<string, unknown> => r !== null)
        .map(read)
        .filter((v): v is { id: string; name: string } => v !== null);
    return {
      people: pick(assignees, (r) => typeof r.login === 'string' ? { id: r.login, name: r.login } : null),
      milestones: pick(milestones, (r) => (typeof r.number === 'number' || typeof r.number === 'string') && typeof r.title === 'string'
        ? { id: String(r.number), name: r.title } : null),
      labels: pick(labels, (r) => typeof r.name === 'string' ? { id: r.name, name: r.name } : null).map((l) => l.name),
    };
  },
};
