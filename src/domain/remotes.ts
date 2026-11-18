// Pure parser for `git remote -v` output, feeding empty-repos discovery
// (review #4): empty `repos` setting = workspace git remotes + assigned-to-me.
// Only GitHub/GitLab remotes map to task sources; anything else is skipped.
export const parseGitRemotes = (output: string): string[] => {
  const keys = new Set<string>();
  for (const line of output.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    let url = line.slice(tab + 1).trim();
    const space = url.search(/\s+\((fetch|push)\)$/);
    if (space !== -1) url = url.slice(0, space).trim();
    const key = repoKeyFromUrl(url);
    if (key) keys.add(key);
  }
  return [...keys];
};

const repoKeyFromUrl = (url: string): string | null => {
  let host: string;
  let path: string;
  const https = /^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(url);
  if (https) {
    host = https[1]!.toLowerCase();
    path = https[2]!;
  } else if (ssh) {
    host = ssh[1]!.toLowerCase();
    path = ssh[2]!;
  } else {
    return null;
  }
  if (!path || path.includes(' ')) return null;
  if (host === 'github.com') return `github:${path}`;
  // Public GitLab drops the host (same key shape as the repos setting);
  // self-hosted GitLab keeps it (gitlab:host/path).
  if (host === 'gitlab.com') return `gitlab:${path}`;
  if (host.startsWith('gitlab.')) return `gitlab:${host}/${path}`;
  return null;
};
