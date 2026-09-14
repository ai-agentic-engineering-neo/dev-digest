/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/** Secret name (via the Secrets adapter) holding the GitHub PAT for private clones. */
export const GITHUB_TOKEN_SECRET = 'GITHUB_TOKEN';

/** Secret name (via the Secrets adapter) holding the GitLab PAT for private clones. */
export const GITLAB_TOKEN_SECRET = 'GITLAB_TOKEN';

/**
 * Parse `owner`/`repo` from a GitHub URL — supports both
 * `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo.git`.
 * GitHub owners are a single path segment (orgs/users can't contain "/").
 */
export const GITHUB_URL_REGEX = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/;

/**
 * Parse `owner`/`repo` from a GitLab.com URL — supports both https and ssh
 * forms, AND nested group namespaces (`group/subgroup/project`). `owner` is
 * everything up to the last `/` segment (the project name).
 */
export const GITLAB_URL_REGEX = /gitlab\.com[/:](.+)\/([^/.]+)(?:\.git)?\/?$/;

/** Username embedded into an authenticated https github.com clone URL. */
export const GIT_TOKEN_USERNAME = 'x-access-token';

/** Host for which a token is embedded into an https clone URL. */
export const GITHUB_HTTPS_HOST = 'github.com';

/** Host for which a token is embedded into an https clone URL (GitLab.com only). */
export const GITLAB_HTTPS_HOST = 'gitlab.com';
