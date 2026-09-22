import { parseGitHubRepoUrl } from '@devdigest/shared';
import { InvalidInputError } from '../../platform/errors.js';

/**
 * F1 — repos pure helpers. No I/O, no DB, no container.
 */

/**
 * Parse `owner`/`name` from a GitHub URL (https or ssh form). Anchored and
 * charset-restricted (see `parseGitHubRepoUrl`) because the result becomes the
 * on-disk clone path `<cloneDir>/<owner>/<name>`.
 */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  const parsed = parseGitHubRepoUrl(url);
  if (!parsed) {
    throw new InvalidInputError(`Could not parse owner/repo from '${url}'`, undefined, 'invalid_repo_url');
  }
  return parsed;
}

/** HTTPS clone URL of a GitHub repo by its `owner/name`. */
export function githubCloneUrl(fullName: string): string {
  return `https://github.com/${fullName}.git`;
}
