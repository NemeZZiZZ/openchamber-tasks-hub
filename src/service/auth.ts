// Where the service finds a token for an adapter on a host, in order: the
// account the user connected in OpenChamber for that exact host, the token
// pasted on the Tasks card (only for the adapter's public host or the
// self-hosted server its settings configure), then the adapter's CLI for
// that host. Each source is re-read on every request so a reconnect or
// revoke takes effect without restarting the service.
// Semantics copied from openchamber-ci-hub src/service/auth.ts.

export type TokenSource = 'openchamber' | 'setting' | 'cli';

export type TokenResult =
  | { token: string; source: TokenSource }
  | { token: null; source: null; message: string };

// Structural subset of TaskAdapter the auth layer needs (TaskAdapter
// satisfies it; tests use fixtures).
export type ProviderLike = {
  id: string;
  label: string;
  storeKey: string | null;
  publicHosts: string[];
  cli?: { program: string; tokenArgs: (host: string) => string[] };
  settingKey?: string;
  serverSetting?: string;
  authSetting?: string;
};

export type KnownInstance = { provider: string; host: string };

export interface AuthDeps {
  /** Raw text of `~/.config/openchamber/source-control-auth.json`, or undefined. */
  readStore: () => Promise<string | undefined>;
  readSettings: () => Promise<Record<string, string>>;
  /** Runs a provider CLI's token command; resolves null when missing or logged out. */
  cliToken: (program: string, args: string[]) => Promise<string | null>;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
};

const instancesOf = (raw: string | undefined, storeKey: string | null): Record<string, unknown> | null => {
  if (!raw || storeKey === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return asRecord(asRecord(asRecord(asRecord(parsed)?.providers)?.[storeKey])?.instances);
};

/**
 * Pulls the active, valid credential for `host` out of the platform store,
 * under `providers.<storeKey>`. Anything unexpected in the file means "no
 * credential", never a throw.
 */
export const tokenFromStore = (raw: string | undefined, storeKey: string | null, host: string): string | null => {
  const instances = instancesOf(raw, storeKey);
  if (!instances) return null;
  for (const [baseUrl, value] of Object.entries(instances)) {
    if (hostOf(baseUrl) !== host && hostOf(baseUrl) !== `api.${host}`) continue;
    const instance = asRecord(value);
    const credentials = Array.isArray(instance?.credentials) ? instance.credentials : [];
    const activeId = typeof instance?.activeCredentialId === 'string' ? instance.activeCredentialId : null;
    const candidates = credentials
      .map(asRecord)
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .sort((a, b) => Number(b.credentialId === activeId) - Number(a.credentialId === activeId));
    for (const credential of candidates) {
      const status = typeof credential.status === 'string' ? credential.status : 'valid';
      if (status !== 'valid' && status !== 'unknown') continue;
      const token = credential.token ?? credential.accessToken;
      if (typeof token === 'string' && token.trim()) return token.trim();
    }
  }
  return null;
};

/** Hosts connected in OpenChamber, for the adapters we register. */
export const knownInstances = (raw: string | undefined, providers: ProviderLike[]): KnownInstance[] => {
  const known: KnownInstance[] = [];
  for (const provider of providers) {
    if (provider.storeKey === null) continue;
    for (const baseUrl of Object.keys(instancesOf(raw, provider.storeKey) ?? {})) {
      const host = hostOf(baseUrl);
      if (host && !known.some((entry) => entry.provider === provider.id && entry.host === host))
        known.push({ provider: provider.id, host });
    }
  }
  return known;
};

const missingMessage = (provider: ProviderLike, host: string): string => {
  const login = provider.cli ? `${provider.cli.program} auth login` : null;
  if (provider.publicHosts.includes(host)) {
    const ways = [`Connect ${provider.label} in OpenChamber`];
    if (provider.settingKey)
      ways.push(
        provider.authSetting
          ? `paste ${provider.settingKey} and ${provider.authSetting} on the Tasks card`
          : `paste ${provider.settingKey} on the Tasks card`,
      );
    if (login) ways.push(`run ${login}`);
    const list = ways.length > 1 ? `${ways.slice(0, -1).join(', ')}, or ${ways[ways.length - 1]}` : ways[0];
    return `No ${provider.label} account for ${host}. ${list}.`;
  }
  if (provider.serverSetting && provider.settingKey) {
    // A server backed only by card settings cannot be "connected" in
    // OpenChamber: the URL and the token are both pasted settings.
    return `No ${provider.label} token for ${host}. Set ${provider.serverSetting} and paste ${provider.settingKey} on the Tasks card.`;
  }
  return `No ${provider.label} account for ${host}. Connect that server in OpenChamber${login ? ` or run ${login} --hostname ${host}` : ''}.`;
};

/**
 * The self-hosted server a provider's settings stand for (gitlab-server):
 * trimmed, https by default, http only when pasted. The host is lowercased
 * and keeps its port. Null when unset or unparseable.
 */
export const serverOf = (settings: Record<string, string>, provider: ProviderLike): { origin: string; host: string } | null => {
  if (!provider.serverSetting) return null;
  const raw = settings[provider.serverSetting]?.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    // A path in the server URL would be silently cut; refuse it so the
    // needs-configuration path explains instead.
    if (url.pathname && url.pathname !== '/') return null;
    return { origin: url.origin, host: url.host.toLowerCase() };
  } catch {
    return null;
  }
};

export const resolveToken = async (deps: AuthDeps, provider: ProviderLike, host: string): Promise<TokenResult> => {
  const stored = tokenFromStore(await deps.readStore().catch(() => undefined), provider.storeKey, host);
  if (stored) return { token: stored, source: 'openchamber' };

  // The pasted token belongs to the provider's public host, or to the
  // self-hosted server its settings configure. Any other host (a lookalike
  // such as github.evil.com) only ever gets a credential the user tied to
  // that exact host.
  const settings = await deps.readSettings().catch(() => ({}) as Record<string, string>);
  const configuredServer = serverOf(settings, provider)?.host;
  if (provider.settingKey && (provider.publicHosts.includes(host) || configuredServer === host)) {
    const pasted = settings[provider.settingKey]?.trim();
    // A provider whose credentials are a user:secret pair is only complete
    // when both halves are pasted; a lone token is withheld so the missing
    // message names both card fields.
    const companion = provider.authSetting ? settings[provider.authSetting]?.trim() : undefined;
    if (pasted && (!provider.authSetting || companion)) return { token: pasted, source: 'setting' };
  }

  if (provider.cli) {
    const fromCli = (await deps.cliToken(provider.cli.program, provider.cli.tokenArgs(host)).catch(() => null))?.trim();
    if (fromCli) return { token: fromCli, source: 'cli' };
  }

  return { token: null, source: null, message: missingMessage(provider, host) };
};

export const sourceLabel = (source: TokenSource, provider: ProviderLike): string =>
  source === 'openchamber'
    ? 'OpenChamber account'
    : source === 'setting'
      ? 'token on the Tasks card'
      : `${provider.cli?.program ?? provider.label} CLI`;
