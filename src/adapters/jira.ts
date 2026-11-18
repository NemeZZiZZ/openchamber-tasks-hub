// Jira adapter (service-side REST v3). Columns = status names (passthrough
// as listId); move = transition resolved by target status name. Auth:
// settings-only Basic `jira-email` + `jira-token` against the configured
// `jira-host` (anti-phish: the token is honored only for that exact host).
// externalId = `<projectKey>#<issueKey>`; nativeId carries the issue key.
import { toListId, statusForListId } from '../domain/statusMap.ts';
import { AdapterError, type AdapterOptions, type Ctx, type NewTask, type RemoteTask, type Scope, type TaskAdapter } from './types.ts';
import { asRecord } from './json.ts';

// ADF (Atlassian Document Format) paragraph for description writes.
const adf = (text: string): Record<string, unknown> => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

// ADF → plain text for the board (paragraphs only; nested blocks skipped).
const adfText = (raw: unknown): string => {
  const doc = asRecord(raw);
  const content = Array.isArray(doc?.content) ? doc.content : [];
  const parts: string[] = [];
  for (const block of content) {
    const inner = asRecord(block)?.content;
    if (!Array.isArray(inner)) continue;
    for (const node of inner) {
      const text = asRecord(node)?.text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('\n');
};

const mapIssue = (raw: unknown, host: string, projectKey: string): RemoteTask | null => {
  const issue = asRecord(raw);
  const fields = asRecord(issue?.fields);
  if (!issue || !fields) return null;
  if (typeof issue.key !== 'string' || typeof fields.summary !== 'string') return null;
  const status = asRecord(fields.status);
  const listId = status && typeof status.name === 'string' ? status.name : 'open';
  const iso = typeof fields.updated === 'string' ? Date.parse(fields.updated) : NaN;
  const assignee = asRecord(fields.assignee);
  const labels = Array.isArray(fields.labels)
    ? fields.labels.filter((l): l is string => typeof l === 'string')
    : [];
  return {
    externalId: `${projectKey}#${issue.key}`,
    url: `https://${host}/browse/${issue.key}`,
    title: fields.summary,
    description: adfText(fields.description),
    listId: toListId('jira', { listId }),
    status: statusForListId('jira', listId),
    projectRef: `jira:${host}/${projectKey}`,
    assignee: assignee && typeof assignee.displayName === 'string' ? assignee.displayName : null,
    dueDate: typeof fields.duedate === 'string' ? fields.duedate : null,
    labels,
    updatedAt: Number.isFinite(iso) ? iso : 0,
    nativeId: issue.key,
  };
};

export const jiraAdapter: TaskAdapter = {
  id: 'jira',
  label: 'Jira',
  storeKey: null,
  publicHosts: ['atlassian.net'],
  settingKey: 'jira-token',
  authSetting: 'jira-email',
  serverSetting: 'jira-host',

  async list(ctx: Ctx, scope: Scope): Promise<RemoteTask[]> {
    const out: RemoteTask[] = [];
    for (const repo of scope.repos) {
      if (!repo.startsWith('jira:')) continue;
      const ref = parseRepoRef(repo);
      if (!ref) continue;
      const auth = await credentialsFor(ctx, ref.host);
      // GET /rest/api/3/search was removed (410): the replacement is
      // POST /search/jql with the same paging shape.
      const result = await call(ctx, 'POST', ref.host, '/rest/api/3/search/jql', auth, {
        jql: `project = ${ref.projectKey} ORDER BY updated DESC`,
        fields: ['summary', 'description', 'status', 'labels', 'assignee', 'updated', 'duedate'],
        maxResults: 100,
      });
      const issues = asRecord(result)?.issues;
      if (Array.isArray(issues)) for (const raw of issues) {
        const task = mapIssue(raw, ref.host, ref.projectKey);
        if (task) out.push(task);
      }
    }
    return out;
  },

  async get(ctx: Ctx, id: string): Promise<RemoteTask | null> {
    const ref = parseTaskId(id);
    const auth = await credentialsFor(ctx, ref.host);
    const issue = await call(ctx, 'GET', ref.host, `/rest/api/3/issue/${encodeURIComponent(ref.issueKey)}?fields=summary,description,status,labels,assignee,updated,duedate`, auth);
    return issue ? mapIssue(issue, ref.host, ref.projectKey) : null;
  },

  async create(ctx: Ctx, input: NewTask): Promise<string> {
    const ref = input.projectRef?.startsWith('jira:') ? parseRepoRef(input.projectRef) : null;
    if (!ref) throw new AdapterError('create needs a projectRef like jira:<host>/<projectKey>', false);
    const auth = await credentialsFor(ctx, ref.host);
    const created = await call(ctx, 'POST', ref.host, '/rest/api/3/issue', auth, {
      fields: {
        project: { key: ref.projectKey },
        summary: input.title,
        description: adf(input.description),
        issuetype: { name: 'Task' },
        ...(input.labels && input.labels.length > 0 ? { labels: input.labels } : {}),
      },
    });
    const key = asRecord(created)?.key;
    if (typeof key !== 'string') throw new AdapterError('Jira create returned no issue key', true);
    // Composite id: the same shape this adapter's own get()/parseTaskId read.
    return `${ref.projectKey}#${key}`;
  },

  async update(ctx: Ctx, id: string, patch): Promise<void> {
    const ref = parseTaskId(id);
    const auth = await credentialsFor(ctx, ref.host);
    const fields: Record<string, unknown> = {};
    if (typeof patch?.title === 'string') fields.summary = patch.title;
    if (typeof patch?.description === 'string') fields.description = adf(patch.description);
    if (Array.isArray(patch?.labels)) fields.labels = patch.labels;
    // Lifecycle field edits: assigneeId is the accountId (null unassigns);
    // duedate is ISO yyyy-mm-dd (null unsets). milestoneId is never sent —
    // Jira has no milestone field (capability false).
    if (patch?.assigneeId !== undefined) fields.assignee = patch.assigneeId ? { accountId: patch.assigneeId } : null;
    if (patch?.dueDate !== undefined) fields.duedate = patch.dueDate;
    if (typeof patch?.listId === 'string' && patch.listId !== (patch.fromListId ?? '')) {
      const transitions = await call(ctx, 'GET', ref.host, `/rest/api/3/issue/${encodeURIComponent(ref.issueKey)}/transitions`, auth);
      const list = asRecord(transitions)?.transitions;
      const match = Array.isArray(list)
        ? list.map(asRecord).find((t) => asRecord(t?.to)?.name === patch.listId)
        : null;
      if (!match || typeof match.id !== 'string') {
        throw new AdapterError(`No Jira transition to "${patch.listId}" for ${ref.issueKey}`, false);
      }
      await call(ctx, 'POST', ref.host, `/rest/api/3/issue/${encodeURIComponent(ref.issueKey)}/transitions`, auth, {
        transition: { id: match.id },
      });
    }
    // Label-column moves arrive as add/remove (they never silently no-op):
    // full replace goes in `fields`, incremental edits in `update`.
    const ops: { add?: string; remove?: string }[] = [
      ...(patch?.addLabels ?? []).map((add) => ({ add })),
      ...(patch?.removeLabels ?? []).map((remove) => ({ remove })),
    ];
    if (ops.length > 0) {
      await call(ctx, 'PUT', ref.host, `/rest/api/3/issue/${encodeURIComponent(ref.issueKey)}`, auth, {
        update: { labels: ops },
      });
    }
    if (Object.keys(fields).length === 0) return;
    await call(ctx, 'PUT', ref.host, `/rest/api/3/issue/${encodeURIComponent(ref.issueKey)}`, auth, { fields });
  },

  capabilities: {
    create: true,
    delete: true,
    fields: { assignee: true, milestone: false, dueDate: true, labels: true },
  },

  // call() maps 404 and empty-204 alike, so delete fetches directly: the
  // engine treats notFound as idempotent success.
  async delete(ctx: Ctx, id: string): Promise<void> {
    const ref = parseTaskId(id);
    const auth = await credentialsFor(ctx, ref.host);
    let res: Awaited<ReturnType<Ctx['fetch']>>;
    try {
      res = await ctx.fetch(`${auth.origin}/rest/api/3/issue/${encodeURIComponent(ref.issueKey)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: auth.authorization },
      });
    } catch (err) {
      throw new AdapterError(`Jira network error: ${(err as Error).message}`, true);
    }
    if (res.status === 404) throw new AdapterError(`Jira issue ${ref.issueKey} not found`, false, true);
    if (res.status === 401 || res.status === 403) throw new AdapterError(`Jira auth failed (${res.status})`, false);
    if (res.status >= 400) throw new AdapterError(`Jira API ${res.status}`, res.status === 429 || res.status >= 500);
  },

  async options(ctx: Ctx, projectRef: string): Promise<AdapterOptions> {
    const ref = projectRef?.startsWith('jira:') ? parseRepoRef(projectRef) : null;
    if (!ref) throw new AdapterError('options need a projectRef like jira:<host>/<projectKey>', false);
    const auth = await credentialsFor(ctx, ref.host);
    const [users, labels] = await Promise.all([
      call(ctx, 'GET', ref.host, `/rest/api/3/user/assignable/search?project=${encodeURIComponent(ref.projectKey)}&maxResults=100`, auth),
      call(ctx, 'GET', ref.host, '/rest/api/3/label?maxResults=200', auth),
    ]);
    const people = (Array.isArray(users) ? users : [])
      .map((u) => asRecord(u))
      .filter((u): u is Record<string, unknown> => u !== null && typeof u.accountId === 'string')
      .map((u) => ({ id: u.accountId as string, name: typeof u.displayName === 'string' && u.displayName ? u.displayName : (u.accountId as string) }));
    const values = asRecord(labels)?.values;
    const names = Array.isArray(values) ? values.filter((l): l is string => typeof l === 'string') : [];
    return { people, milestones: [], labels: names };
  },
};

const parseRepoRef = (repo: string): { host: string; projectKey: string } | null => {
  const withoutProvider = repo.slice('jira:'.length);
  const slash = withoutProvider.indexOf('/');
  if (slash <= 0 || slash === withoutProvider.length - 1) return null;
  return { host: withoutProvider.slice(0, slash).toLowerCase(), projectKey: withoutProvider.slice(slash + 1) };
};

const parseTaskId = (id: string): { host: string; projectKey: string; issueKey: string } => {
  // externalId is `<projectKey>#<issueKey>`; the host comes from the
  // configured server (one Jira site per card in v1).
  const at = id.lastIndexOf('#');
  if (at <= 0 || at === id.length - 1) throw new AdapterError(`bad Jira task id: ${id}`, false);
  const projectKey = id.slice(0, at);
  const issueKey = id.slice(at + 1);
  return { host: '__configured__', projectKey, issueKey };
};

const credentialsFor = async (ctx: Ctx, host: string): Promise<{ origin: string; authorization: string }> => {
  const raw = (await ctx.settings('jira-host'))?.trim();
  const email = (await ctx.settings('jira-email'))?.trim();
  const token = (await ctx.settings('jira-token'))?.trim();
  if (!raw || !email || !token) {
    throw new AdapterError('No Jira credentials. Set jira-host and paste jira-email and jira-token on the Tasks card.', false, false, true);
  }
  const configured = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  const parsed = (() => {
    try {
      return new URL(configured);
    } catch {
      return null;
    }
  })();
  const origin = parsed?.origin ?? null;
  const configuredHost = parsed ? parsed.host.toLowerCase() : null;
  if (!origin || !configuredHost || (host !== '__configured__' && host !== configuredHost)) {
    throw new AdapterError(`No Jira account for ${host}. Tokens are honored only for the configured jira-host (${configuredHost ?? 'unset'}).`, false);
  }
  return { origin, authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
};

const call = async (
  ctx: Ctx, method: string, host: string, path: string,
  auth: { origin: string; authorization: string }, body?: unknown,
): Promise<unknown | null> => {
  let res: Awaited<ReturnType<Ctx['fetch']>>;
  try {
    res = await ctx.fetch(`${auth.origin}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: auth.authorization,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AdapterError(`Jira network error: ${(err as Error).message}`, true);
  }
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new AdapterError(`Jira auth failed (${res.status})`, false);
  if (res.status >= 400) throw new AdapterError(`Jira API ${res.status}`, res.status === 429 || res.status >= 500);
  if (res.status === 204) return null;
  void host;
  return await res.json().catch(() => null);
};
