import { type Repo, type RepoProvider } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import {
  GITHUB_URL_REGEX,
  GITLAB_URL_REGEX,
  GIT_TOKEN_USERNAME,
  GITHUB_HTTPS_HOST,
  GITLAB_HTTPS_HOST,
} from './constants.js';

/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */

/**
 * Parse `provider`/`owner`/`name` from a github.com or gitlab.com URL (https
 * or ssh form). GitLab `owner` may be a nested group path
 * (`group/subgroup`); GitHub `owner` is always a single segment.
 */
export function parseRepoUrl(url: string): { provider: RepoProvider; owner: string; name: string } {
  const gh = url.match(GITHUB_URL_REGEX);
  if (gh?.[1] && gh[2]) {
    return { provider: 'github', owner: gh[1], name: gh[2] };
  }
  const gl = url.match(GITLAB_URL_REGEX);
  if (gl?.[1] && gl[2]) {
    return { provider: 'gitlab', owner: gl[1], name: gl[2] };
  }
  throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
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
