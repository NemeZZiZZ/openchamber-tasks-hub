// Tasks service: the only place a token lives. OpenChamber starts it on the
// first request and stops it after ten quiet minutes. Shape follows
// openchamber-ci-hub service/main.ts: bearer gate, file store in the data
// dir, readStore file read, readSettings via the service host, gh/glab CLI
// tokens with a 60s cache.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServiceHost } from '@openchamber/sdk';
import { createFileStorage } from '../src/service/configStore.ts';
import { createEngine } from '../src/service/engine.ts';
import { handleRequest } from '../src/service/routes.ts';
import { parseGitRemotes } from '../src/domain/remotes.ts';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN;
if (!Number.isInteger(port) || port <= 0 || !token) {
  console.error('[tasks] OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

const home = homedir();
const dataDir = process.env.OPENCHAMBER_SERVICE_DATA_DIR || join(home, '.openchamber-tasks');
const storePath = join(home, '.config', 'openchamber', 'source-control-auth.json');
const MAX_BODY_BYTES = 256 * 1024;

// The service's way back into OpenChamber: readSettings, emit, needsConfig.
const host = process.env.OPENCHAMBER_HOST_CALLBACK_URL ? createServiceHost({ env: process.env }) : null;

const run = (program: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    execFile(program, args, { timeout: 10_000, maxBuffer: 1024 * 1024, env: process.env }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number((err as { code: number }).code) : -1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });

// Provider CLIs the service may ask for a token. Keep in step with the
// manifest's `exec` permission, which the host enforces anyway.
const CLI_PROGRAMS = new Set(['gh', 'glab']);

// A token command costs a process; a minute of caching is plenty, and a
// logout is picked up on the next minute.
const cliCache = new Map<string, { value: string | null; at: number }>();
const cliToken = async (program: string, args: string[]): Promise<string | null> => {
  if (!CLI_PROGRAMS.has(program)) return null;
  const key = [program, ...args].join('\0');
  const hit = cliCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const result = await run(program, args);
  const value = result.code === 0 && result.stdout.trim() ? result.stdout.trim() : null;
  cliCache.set(key, { value, at: Date.now() });
  return value;
};

let warnedStore = false;
const readStore = async (): Promise<string | undefined> => {
  try {
    return await readFile(storePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !warnedStore) {
      warnedStore = true;
      console.warn('[tasks] could not read the OpenChamber credential store:', (err as Error).message);
    }
    return undefined;
  }
};

const storage = createFileStorage(dataDir);

// Empty-`repos` discovery (review #4): the panel reports workspace project
// roots via POST /workspace; this service runs `git remote -v` in each and
// parses provider repo keys, cached for a minute (a logout/rename is picked
// up on the next minute).
const REMOTE_CACHE_MS = 60_000;
let remotesCache: { keys: string[]; at: number } | null = null;
const workspaceRemotes = async (): Promise<string[]> => {
  if (remotesCache && Date.now() - remotesCache.at < REMOTE_CACHE_MS) return remotesCache.keys;
  const directories = await storage.get('workspace:directories');
  if (!Array.isArray(directories)) return [];
  const keys: string[] = [];
  for (const directory of directories) {
    if (typeof directory !== 'string') continue;
    const result = await run('git', ['-C', directory, 'remote', '-v']).catch(() => null);
    if (!result || result.code !== 0) continue;
    keys.push(...parseGitRemotes(result.stdout));
  }
  remotesCache = { keys: [...new Set(keys)], at: Date.now() };
  return remotesCache.keys;
};

const engine = createEngine({
  storage,
  settings: async (key) => {
    if (!host) return null;
    const settings = await host.readSettings().catch(() => ({} as Record<string, string>));
    return settings[key] ?? null;
  },
  fetch: (input, init) => fetch(input, init),
  auth: { readStore, readSettings: host ? () => host.readSettings() : async () => ({}), cliToken },
  now: () => Date.now(),
  newId: () => randomUUID(),
  workspaceRemotes,
});

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  const reply = (status: number, body: unknown): void => {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  };
  try {
    const body = await readBody(req);
    const result = await handleRequest(
      { method: req.method ?? 'GET', url: req.url ?? '/', body, bearer: req.headers.authorization ?? null },
      engine,
      token,
    );
    reply(result.status, result.body);
  } catch (err) {
    // An over-limit body is the client's fault, not an internal error.
    if (err instanceof Error && err.message === 'body too large') {
      reply(413, { error: 'body too large' });
      return;
    }
    console.error('[tasks] request failed', err);
    reply(500, { error: 'internal' });
  }
});

server.listen(port, '127.0.0.1');
