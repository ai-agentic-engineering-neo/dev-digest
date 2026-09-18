import { type Repo, type RepoProvider } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import {
  REPO_PATH_SEGMENT_REGEX,
  GIT_TOKEN_USERNAME,
  GITHUB_HTTPS_HOST,
  GITLAB_HTTPS_HOST,
} from './constants.js';

/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */

/** The actual authority (host[:port]) + path a git URL resolves to, or null if unparseable. */
function resolveGitUrl(url: string): { host: string; path: string } | null {
  // https(s)/http(s) form — the only form we trust the *hostname* of the URL
  // object for, never a substring match against the raw string (that was the
  // SSRF/spoofing hole: a URL like "https://attacker.example/x/github.com/o/r"
  // would substring-match "github.com" without actually pointing there).
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return { host: u.hostname.toLowerCase(), path: u.pathname };
    }
    return null;
  } catch {
    /* not an absolute URL — fall through to the scp-like ssh form below */
  }
  // scp-like ssh form: [ssh://]git@host:owner/repo(.git)
  const ssh = url.match(/^(?:ssh:\/\/)?git@([^/:@]+):\/?(.+)$/);
  if (ssh?.[1] && ssh[2]) {
    return { host: ssh[1].toLowerCase(), path: `/${ssh[2]}` };
  }
  return null;
}

function providerForHost(host: string): RepoProvider | null {
  if (host === GITHUB_HTTPS_HOST) return 'github';
  if (host === GITLAB_HTTPS_HOST) return 'gitlab';
  return null;
}

/**
 * Parse `provider`/`owner`/`name` from a github.com or gitlab.com URL (https
 * or ssh form). GitLab `owner` may be a nested group path
 * (`group/subgroup`); GitHub `owner` is always a single segment. Validates
 * the URL's actual host (not a substring match) and rejects path segments
 * that aren't a plain repo-slug shape (blocks `..` path-traversal segments).
 */
export function parseRepoUrl(url: string): { provider: RepoProvider; owner: string; name: string } {
  const invalid = () => new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);

  const resolved = resolveGitUrl(url);
  if (!resolved) throw invalid();
  const provider = providerForHost(resolved.host);
  if (!provider) throw invalid();

  const segments = resolved.path
    .replace(/\.git\/?$/, '')
    .split('/')
    .filter((s) => s.length > 0);
  if (segments.length < 2 || !segments.every((s) => REPO_PATH_SEGMENT_REGEX.test(s))) {
    throw invalid();
  }

  const name = segments[segments.length - 1]!;
  const owner = segments.slice(0, -1).join('/');
  return { provider, owner, name };
}

/**
 * Embed a token into an authenticated https clone URL so private clones
 * authenticate non-interactively. SSH/unrecognized-host URLs are left
 * untouched. Never persisted, logged, or thrown — construct just-in-time.
 */
export function withProviderToken(url: string, provider: RepoProvider, token: string): string {
  const host = provider === 'gitlab' ? GITLAB_HTTPS_HOST : GITHUB_HTTPS_HOST;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === host) {
      u.username = GIT_TOKEN_USERNAME;
      u.password = token;
      return u.toString();
    }
  } catch {
    /* non-URL (e.g. git@host:...) — leave as-is */
  }
  return url;
}

/** Map a persisted repo row to the API `Repo` DTO. */
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    provider: row.provider as RepoProvider,
    owner: row.owner,
    name: row.name,
    full_name: row.fullName,
    default_branch: row.defaultBranch,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
  };
}
