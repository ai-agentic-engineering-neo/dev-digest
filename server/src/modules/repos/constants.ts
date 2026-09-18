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
 * A path segment allowed in an owner/name (GitHub) or group/subgroup/name
 * (GitLab) repo path — deliberately excludes `/`, `.`/`..` (path traversal),
 * and anything else that isn't a normal repo-slug character.
 */
export const REPO_PATH_SEGMENT_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Username embedded into an authenticated https github.com clone URL. */
export const GIT_TOKEN_USERNAME = 'x-access-token';

/** Host for which a token is embedded into an https clone URL. */
export const GITHUB_HTTPS_HOST = 'github.com';

/** Host for which a token is embedded into an https clone URL (GitLab.com only). */
export const GITLAB_HTTPS_HOST = 'gitlab.com';
