// Adapter contract (service-side). New platform = implement this interface +
// register in ./index.ts; no UI or service-protocol change (design G1).
import type { AdapterId, TaskPatch, TaskStatus } from '../domain/task.ts';

// Minimal storage seam (kanban Pick<HostClient,'storage'> pattern): local
// adapter, overlay store and prefs all run over this. Structural — an SDK
// HostClient storage satisfies it.
export type StorageClient = {
  keys(): Promise<string[]>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

export type SettingsReader = (key: string) => Promise<string | null>;

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; json(): Promise<unknown>; text(): Promise<string> }>;

// Per-call adapter context; service builds it, tests inject fakes.
export type Ctx = {
  storage: StorageClient;
  settings: SettingsReader;
  fetch: FetchLike;
  now(): number;
  newId(): string;
  // Auth deps for resolveToken (service main wires them; ci-hub shape).
  auth: {
    readStore(): Promise<string | undefined>;
    readSettings(): Promise<Record<string, string>>;
    cliToken(program: string, args: string[]): Promise<string | null>;
  };
};

// Write-back failure taxonomy: PATCH failure surfaces as {error, retryable}
// (never silent divergence); notFound lets list() skip a missing repo;
// credentials flags a permanent "nothing configured" state — the UI shows
// it once (toast), not as a permanent banner (review UX).
// (Explicit fields: strip-types forbids constructor parameter properties.)
export class AdapterError extends Error {
  retryable: boolean;
  notFound: boolean;
  credentials: boolean;
  constructor(message: string, retryable: boolean, notFound = false, credentials = false) {
    super(message);
    this.retryable = retryable;
    this.notFound = notFound;
    this.credentials = credentials;
  }
}

// Repo key format: `provider:path` on the public host, `provider:host/path`
// for self-hosted (ci-hub "github:host/path" shape).
export type RepoRef = { host: string; path: string };

export const parseRepoKey = (key: string, publicHost: string): RepoRef | null => {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const rest = key.slice(idx + 1);
  if (!rest) return null;
  const slash = rest.indexOf('/');
  const head = slash === -1 ? rest : rest.slice(0, slash);
  if (head.includes('.')) {
    return { host: head.toLowerCase(), path: slash === -1 ? '' : rest.slice(slash + 1) };
  }
  return { host: publicHost, path: rest };
};

export const makeRepoKey = (provider: string, host: string, path: string, publicHost: string): string =>
  host === publicHost ? `${provider}:${path}` : `${provider}:${host}/${path}`;


// v1 scope: user-selected repos + "assigned to me" (design Scope v1).
export type Scope = { repos: string[]; assignee: string | null };

// Adapter output before the overlay join; the engine turns these into
// UnifiedTask rows.
export type RemoteTask = {
  externalId: string;
  url: string | null;
  title: string;
  description: string;
  listId: string;
  status: TaskStatus;
  projectRef: string | null;
  assignee: string | null;
  labels: string[];
  updatedAt: number;
  author?: string | null;
  closed?: boolean;
  milestone?: string | null;
  dueDate?: string | null;
  comments?: number;
  checklist?: { done: number; total: number } | null;
  // GitLab work items: preserved issue_type ('issue' | 'incident' | …).
  issueType?: string;
  // Platform-native id when it differs from externalId (Linear uuid needed
  // for mutations; Trello card id; Jira issue key).
  nativeId?: string;
};

export type NewTask = {
  projectRef: string | null;
  title: string;
  description: string;
  labels?: string[];
  listId?: string;
};

// Static capability declaration: the UI gates every write affordance on
// this (never hardcodes platform support). deleteNote explains an
// unsupported delete instead of hiding it (GitHub issues cannot be deleted
// via the API).
export type AdapterCapabilities = {
  create: boolean;
  delete: boolean;
  deleteNote?: string;
  // Some sources only accept labels that already exist remotely (Trello).
  // The UI then offers options() as a select instead of free-text input.
  labelsFromOptions?: boolean;
  fields: { assignee: boolean; milestone: boolean; dueDate: boolean; labels: boolean };
};

// One-shot listing for the edit dialog: people/milestones with NATIVE ids
// (login, numeric id, uuid, accountId, memberId) + label names. Empty
// arrays mean "the source has none" — the UI degrades, never guesses.
export type AdapterOptions = {
  people: { id: string; name: string }[];
  milestones: { id: string; name: string }[];
  labels: string[];
};


export interface TaskAdapter {
  id: AdapterId;
  label: string;
  storeKey: string | null; // 'github' | 'gitlab'; local → null
  publicHosts: string[];
  cli?: { program: string; tokenArgs: (host: string) => string[] };
  settingKey?: string;      // manual-token settings field (github-token, …)
  authSetting?: string;     // companion field for user:secret pairs (trello-key, jira-email)
  serverSetting?: string;   // self-hosted server URL setting (gitlab-server, jira-host)
  list(ctx: Ctx, scope: Scope): Promise<RemoteTask[]>;
  get(ctx: Ctx, id: string): Promise<RemoteTask | null>;
  create(ctx: Ctx, input: NewTask): Promise<string>; // returns external id
  update(ctx: Ctx, id: string, patch: TaskPatch): Promise<void>;
  capabilities: AdapterCapabilities;
  delete(ctx: Ctx, id: string): Promise<void>;
  options(ctx: Ctx, projectRef: string): Promise<AdapterOptions>;
}

