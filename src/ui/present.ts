// Pure presentation helpers (no DOM): stable accent colors per list/label
// drawn only from host tokens, short refs, initials, relative time.
import type { UnifiedTask } from '../domain/task.ts';

const KNOWN: Record<string, string> = {
  backlog: 'var(--oc-muted)',
  todo: 'var(--oc-primary)',
  open: 'var(--oc-primary)',
  in_progress: 'var(--oc-info)',
  doing: 'var(--oc-info)',
  review: 'var(--oc-warning)',
  done: 'var(--oc-success)',
  closed: 'var(--oc-success)',
};

const HASHED = ['var(--oc-info)', 'var(--oc-primary)', 'var(--oc-warning)', 'var(--oc-success)'];

const hash = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
};

export const listAccent = (listId: string): string => {
  const key = listId.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return KNOWN[key] ?? HASHED[hash(key) % HASHED.length]!;
};

export const tint = (color: string, percent = 16): string => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

export const listTitle = (listId: string): string => {
  const words = listId.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : listId;
};

// "#42" for numeric issue ids; non-numeric ids (Trello, Linear, Jira keys)
// show as-is without the hash when they already look like a key.
export const taskRef = (task: Pick<UnifiedTask, 'externalId' | 'adapterId'>): string => {
  if (/^\d+$/.test(task.externalId)) return `#${task.externalId}`;
  if (/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(task.externalId)) return task.externalId;
  return task.adapterId === 'local' ? '' : `#${task.externalId.slice(0, 8)}`;
};

export const initials = (name: string | null): string => {
  if (!name) return '';
  const parts = name.replace(/^@/, '').split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
};

export const repoName = (projectRef: string | null): string => {
  if (!projectRef) return '';
  const path = projectRef.replace(/^[^:]+:/, '');
  return path.split('/').slice(-1)[0] ?? path;
};

export const timeAgo = (ts: number, now: number = Date.now()): string => {
  if (!ts || !Number.isFinite(ts)) return '';
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
};

export const sourceLabel = (adapterId: string): string => {
  const names: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', local: 'Local', trello: 'Trello', linear: 'Linear', jira: 'Jira' };
  return names[adapterId] ?? adapterId;
};

// Due date chip: "Nov 20" and whether it is overdue (open tasks only).
export const dueInfo = (due: string | null | undefined, closed: boolean, now: number = Date.now()): { label: string; overdue: boolean } | null => {
  if (!due) return null;
  const ts = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T23:59:59` : due);
  if (!Number.isFinite(ts)) return null;
  const label = new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { label, overdue: !closed && ts < now };
};
