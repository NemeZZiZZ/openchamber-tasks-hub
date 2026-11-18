// Rail panel: compact live summary — open/total/needs-attention, per-list
// counts, tasks that need attention, per-source health. Paints the shared
// last-good cache first (never an empty panel), then refreshes live.
import { connectHost } from '@openchamber/sdk';
import type { JsonValue } from '@openchamber/sdk';
import { applyHostReady, mountBadge, mountButton } from '@openchamber/sdk/ui';
import { createSvc, ServiceError } from './host/serviceClient.ts';
import { railCounts } from './ui/shellState.ts';
import { injectStyles } from './ui/styles.ts';
import { clear, el, slot } from './ui/dom.ts';
import { listAccent, listTitle, repoName, sourceLabel, taskRef, timeAgo } from './ui/present.ts';
import { buildCache, loadListCache, saveListCache, type CachedHealth } from './store/listCache.ts';
import type { UnifiedTask } from './domain/task.ts';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing #root');

const storage = {
  get: async (key: string) => await host.storage.get(key),
  set: (key: string, value: unknown) => host.storage.set(key, value as JsonValue),
};

let mounted = false;
let timer: ReturnType<typeof setInterval> | null = null;

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  if (mounted) return;
  mounted = true;
  injectStyles();
  root.replaceChildren();

  const wrap = el('div', 'tk-rail');
  const head = el('div', 'tk-rail-head');
  const title = el('h2', '', 'Tasks Hub');
  const badgeSlot = slot();
  const refreshSlot = slot();
  head.append(title, badgeSlot, refreshSlot);
  const status = el('div', 'tk-muted');
  const stats = el('div', 'tk-stats');
  const body = el('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  const hint = el('p', 'tk-muted', 'Open the Tasks Hub from the Extension pages menu above the session list.');
  wrap.append(head, status, stats, body, hint);
  root.append(wrap);

  const badge = mountBadge(badgeSlot, { label: '0', tone: 'neutral' });
  const refreshBtn = mountButton(refreshSlot, { label: 'Refresh', variant: 'ghost', size: 'xs', onClick: () => { void refresh(); } });

  const stat = (label: string, value: number): HTMLElement => {
    const box = el('div', 'tk-stat');
    box.append(el('b', '', String(value)), el('span', 'tk-muted', label));
    return box;
  };

  const paint = (tasks: readonly UnifiedTask[], health: readonly CachedHealth[]): void => {
    const counts = railCounts(tasks);
    const attention = tasks.filter((t) => t.needsAttentionSince !== null);
    badge.update({ label: String(counts.open), tone: attention.length > 0 ? 'warning' : 'neutral' });
    void host.setBadge(counts.open || null).catch(() => undefined);
    clear(stats);
    stats.append(stat('Open', counts.open), stat('Total', counts.total), stat('Attention', attention.length));

    clear(body);
    const byList = new Map<string, number>();
    for (const t of tasks) if (t.status !== 'done') byList.set(t.listId, (byList.get(t.listId) ?? 0) + 1);
    if (byList.size > 0) {
      const section = el('div');
      section.style.cssText = 'display:flex;flex-direction:column;gap:6px';
      section.append(el('div', 'tk-section-title', 'By list'));
      const row = el('div', 'tk-row');
      row.style.gap = '6px';
      for (const [listId, count] of [...byList].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        const pill = el('span', 'tk-pillbtn', `${listTitle(listId)} · ${count}`);
        pill.style.setProperty('--c', listAccent(listId));
        pill.style.cursor = 'default';
        row.append(pill);
      }
      section.append(row);
      body.append(section);
    }
    if (attention.length > 0) {
      const section = el('div');
      section.style.cssText = 'display:flex;flex-direction:column;gap:6px';
      section.append(el('div', 'tk-section-title', 'Needs attention'));
      const list = el('div', 'tk-list');
      for (const t of attention.sort((a, b) => (b.needsAttentionSince ?? 0) - (a.needsAttentionSince ?? 0)).slice(0, 6)) {
        const item = el('div', 'tk-item');
        item.dataset.attn = '1';
        if (t.sessionId) {
          item.addEventListener('click', () => { void host.openSession(t.sessionId as string).catch(() => undefined); });
        }
        item.append(el('div', 'tk-item-title', t.title));
        const sub = el('div', 'tk-item-sub');
        sub.append(el('span', '', sourceLabel(t.adapterId)));
        const ref = taskRef(t);
        if (ref) sub.append(el('span', 'tk-mono', ref));
        if (t.projectRef) sub.append(el('span', '', repoName(t.projectRef)));
        item.append(sub);
        list.append(item);
      }
      section.append(list);
      body.append(section);
    }
    const bad = [
      ...health.filter((h) => !h.ok && h.kind !== 'credentials').map((h) => `${h.label}: ${h.message ?? 'unavailable'}`),
      ...Object.entries(counts.errorsByAdapter).map(([adapter, message]) => `${adapter}: ${message}`),
    ];
    for (const text of bad) {
      const note = el('div', 'tk-err', `⚠ ${text}`);
      body.append(note);
    }
    if (tasks.length === 0) body.append(el('div', 'tk-empty', 'No tasks yet.'));
  };

  const svc = createSvc(host);
  let lastOk = 0;
  let tasks: UnifiedTask[] = [];
  let health: CachedHealth[] = [];
  let inFlight = false;
  const refresh = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    refreshBtn.update({ loading: true, disabled: true });
    try {
      const [list, registry] = await Promise.all([
        svc<{ tasks: UnifiedTask[]; health: CachedHealth[] }>('GET', '/tasks'),
        svc<{ adapters: { id: string; configured?: boolean }[] }>('GET', '/adapters').catch(() => null),
      ]);
      tasks = list.tasks;
      health = list.health;
      lastOk = Date.now();
      paint(tasks, health);
      status.textContent = 'Updated just now';
      void saveListCache(storage, buildCache({ tasks, health, adapters: registry?.adapters ?? null }, lastOk)).catch(() => undefined);
    } catch (err) {
      status.textContent = `${err instanceof ServiceError ? err.message : 'Tasks service unavailable.'}${lastOk ? ` Showing data from ${timeAgo(lastOk)}.` : ''}`;
    } finally {
      inFlight = false;
      refreshBtn.update({ loading: false, disabled: false });
    }
  };

  void (async () => {
    const cache = await loadListCache(storage).catch(() => null);
    if (cache && cache.tasks.length > 0) {
      tasks = cache.tasks;
      health = cache.health;
      lastOk = cache.savedAt;
      paint(tasks, health);
      status.textContent = `Saved list from ${timeAgo(cache.savedAt)} — updating…`;
    } else {
      status.textContent = 'Loading…';
    }
    await refresh();
  })();

  timer = setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
});

window.addEventListener('pagehide', () => {
  if (timer) clearInterval(timer);
  host.dispose();
});
