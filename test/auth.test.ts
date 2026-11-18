// test/auth.test.ts — ci-hub auth semantics, fixture deps, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenFromStore, knownInstances, resolveToken } from '../src/service/auth.ts';
import type { AuthDeps, ProviderLike } from '../src/service/auth.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;
const ok: typeof assert.ok = assert.ok;

const githubProvider: ProviderLike = {
  id: 'github', label: 'GitHub', storeKey: 'github', publicHosts: ['github.com'],
  cli: { program: 'gh', tokenArgs: () => ['auth', 'token'] }, settingKey: 'github-token',
};
const gitlabProvider: ProviderLike = {
  id: 'gitlab', label: 'GitLab', storeKey: 'gitlab', publicHosts: ['gitlab.com'],
  cli: { program: 'glab', tokenArgs: (h) => ['auth', 'status', '--hostname', h, '--token'] },
  settingKey: 'gitlab-token', serverSetting: 'gitlab-server',
};

const store = (instances: Record<string, unknown>): string =>
  JSON.stringify({ providers: { github: { instances: instances.github ?? {} }, gitlab: { instances: instances.gitlab ?? {} } } });

const fixtureDeps = (over: {
  store?: string;
  settings?: Record<string, string | null>;
  cli?: string | null;
  storeThrows?: boolean;
}): AuthDeps => ({
  readStore: over.storeThrows
    ? async () => { throw new Error('boom'); }
    : async () => over.store,
  readSettings: async () => (over.settings ?? {}) as Record<string, string>,
  cliToken: async () => (over.cli !== undefined ? over.cli : null),
});

test('lookalike host never gets the pasted token (plan excerpt)', async () => {
  const r = await resolveToken(fixtureDeps({ settings: { 'github-token': 'T' } }), githubProvider, 'github.evil.com');
  eq(r.token, null);
  ok(r.message);
});

test('resolve order: openchamber → setting → CLI', async () => {
  const stored = store({ github: { 'https://github.com': {
    activeCredentialId: 'c1',
    credentials: [{ credentialId: 'c1', status: 'valid', token: 'STORE' }],
  } } });
  eq((await resolveToken(fixtureDeps({ store: stored, settings: { 'github-token': 'SET' }, cli: 'CLI' }), githubProvider, 'github.com')).source, 'openchamber');
  eq((await resolveToken(fixtureDeps({ settings: { 'github-token': 'SET' }, cli: 'CLI' }), githubProvider, 'github.com')).source, 'setting');
  eq((await resolveToken(fixtureDeps({ cli: 'CLI' }), githubProvider, 'github.com')).source, 'cli');
});

test('pasted gitlab token honored for configured self-hosted server only', async () => {
  const settings = { 'gitlab-server': 'https://gitlab.example.com', 'gitlab-token': 'T' };
  eq((await resolveToken(fixtureDeps({ settings }), gitlabProvider, 'gitlab.example.com')).source, 'setting');
  eq((await resolveToken(fixtureDeps({ settings }), gitlabProvider, 'gitlab.evil.com')).token, null);
});

test('tokenFromStore: active-first, valid/unknown accepted, invalid skipped, malformed → null', () => {
  const raw = store({ gitlab: {
    'https://gitlab.com': {
      activeCredentialId: 'c2',
      credentials: [
        { credentialId: 'c1', status: 'valid', token: 'OLD' },
        { credentialId: 'c2', status: 'unknown', accessToken: 'ACTIVE' },
      ],
    },
    'https://gitlab.example.com': { credentials: [{ credentialId: 'c9', status: 'valid', token: 'SELF' }] },
    'not-a-url': { credentials: [{ credentialId: 'c0', status: 'valid', token: 'X' }] },
  } });
  eq(tokenFromStore(raw, 'gitlab', 'gitlab.com'), 'ACTIVE');
  eq(tokenFromStore(raw, 'gitlab', 'gitlab.example.com'), 'SELF');
  eq(tokenFromStore(raw, 'gitlab', 'other.example.com'), null);
  const invalid = store({ github: { 'https://github.com': {
    credentials: [{ credentialId: 'c1', status: 'invalid', token: 'X' }],
  } } });
  eq(tokenFromStore(invalid, 'github', 'github.com'), null);
  eq(tokenFromStore('not json', 'github', 'github.com'), null);
  eq(tokenFromStore(undefined, 'github', 'github.com'), null);
  eq(tokenFromStore(raw, null, 'github.com'), null);
});

test('store match includes api. prefix hosts, loops N instances', () => {
  const raw = JSON.stringify({ providers: { github: { instances: {
    'https://api.github.com': { credentials: [{ credentialId: 'c1', status: 'valid', token: 'API' }] },
  } } } });
  eq(tokenFromStore(raw, 'github', 'github.com'), 'API');
});

test('knownInstances lists hosts per provider', () => {
  const raw = store({
    github: { 'https://github.com': {} },
    gitlab: { 'https://gitlab.com': {}, 'https://gitlab.example.com': {} },
  });
  const providers = [githubProvider, gitlabProvider];
  deep(knownInstances(raw, providers), [
    { provider: 'github', host: 'github.com' },
    { provider: 'gitlab', host: 'gitlab.com' },
    { provider: 'gitlab', host: 'gitlab.example.com' },
  ]);
  deep(knownInstances(undefined, providers), []);
});

test('readStore failure means no credential, never a throw', async () => {
  const r = await resolveToken(fixtureDeps({ storeThrows: true, settings: { 'github-token': 'T' } }), githubProvider, 'github.com');
  eq(r.source, 'setting');
});

test('serverOf semantics: https default, path refused, host lowercased', async () => {
  const { serverOf } = await import('../src/service/auth.ts');
  eq(serverOf({ 'gitlab-server': 'gitlab.example.com' }, gitlabProvider)?.origin, 'https://gitlab.example.com');
  eq(serverOf({ 'gitlab-server': 'https://gitlab.example.com/subpath' }, gitlabProvider), null);
  eq(serverOf({}, gitlabProvider), null);
  eq(serverOf({ 'gitlab-server': 'x' }, githubProvider), null);
});
