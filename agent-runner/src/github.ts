import type { GitHubReviewPayload } from '@devdigest/shared';
import { RunnerError } from './errors.js';
import type { PrContext } from './context.js';

/**
 * Thin GitHub REST client built on the global `fetch` (Node 22) — NOT octokit.
 * `octokit` is not a declared dependency of this package (see
 * `agent-runner/package.json`) and the bundle must stay self-contained with no
 * `node_modules/@devdigest/*` (or other) runtime imports beyond what's
 * declared; hand-rolled REST calls keep the surface small and dependency-free.
 * `fetchImpl` is injectable so tests never hit the network.
 */

export type FetchLike = typeof fetch;

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const USER_AGENT = 'devdigest-agent-runner';

function authHeaders(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': USER_AGENT,
  };
}

/** Fetch the PR's unified diff via the GitHub API's diff media type. */
export async function fetchPrDiff(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber'>,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}`;
  const res = await fetchImpl(url, {
    headers: authHeaders(token, 'application/vnd.github.v3.diff'),
  });
  if (!res.ok) {
    throw new RunnerError(
      `GitHub API error fetching PR diff (${url}): ${res.status} ${await res.text().catch(() => '')}`,
    );
  }
  return res.text();
}

/** Post a full review (body + event + optional inline comments) — `post_as: 'github_review'`. */
export async function postGithubReview(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber'>,
  token: string,
  payload: GitHubReviewPayload,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}/reviews`;
  const post = (body: Record<string, unknown>) =>
    fetchImpl(url, {
      method: 'POST',
      headers: {
        ...authHeaders(token, 'application/vnd.github+json'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  // GitHub's Actions token (`GITHUB_TOKEN`) — which the runner always posts with
  // — is NOT permitted to APPROVE a PR (422 "GitHub Actions is not permitted to
  // approve pull requests"). Downgrade an APPROVE event to COMMENT; the body
  // still renders the "Approved ✅" summary, we just don't submit the formal
  // approval GitHub would reject.
  const event = payload.event === 'APPROVE' ? 'COMMENT' : payload.event;
  const base = { body: payload.body, event };
  const hasComments = !!payload.comments && payload.comments.length > 0;
  const withComments = hasComments
    ? { ...base, comments: payload.comments!.map((c) => ({ path: c.path, line: c.line, body: c.body })) }
    : base;

  let res = await post(withComments);

  // GitHub rejects the WHOLE review with a 422 if ANY inline comment targets a
  // file whose diff it can't resolve (e.g. "diff too large" for a huge file).
  // `stripIgnoredFiles` removes our own bundle, but a genuinely large file in a
  // normal PR could still trip this — so degrade gracefully to a body-only
  // review. Every finding is already in `payload.body`; only the inline anchors
  // are lost, which beats posting nothing.
  if (res.status === 422 && hasComments) {
    res = await post(base);
  }

  if (!res.ok) {
    // A 5xx from this endpoint is frequently a TIMEOUT ON THE RESPONSE, not a
    // failed write: GitHub answers 504 while having created the review anyway
    // (observed on a large multi-agent review — 17 KB body + 26 inline
    // comments). Treating that as a failure fails the whole CI check for a
    // review the PR already carries, and a job re-run would then post a second
    // copy of it. So: ask whether the review actually landed before deciding.
    const status = res.status;
    const detail = await res.text().catch(() => '');
    if (status >= 500 && (await reviewAlreadyPosted(ctx, token, payload.body, fetchImpl))) {
      return;
    }
    throw new RunnerError(`GitHub API error posting review (${url}): ${status} ${detail}`);
  }
}

/**
 * Is a review with exactly this body already on the PR?
 *
 * Matched on the body verbatim, which needs no knowledge of the runner's own
 * identity (the token's bot login is not something this process is told). The
 * match is deliberately exact: a near-match would risk swallowing a genuine
 * posting failure. Note this only rescues the "the write succeeded, the
 * response didn't" case within ONE run — a re-run regenerates the review from
 * the model and its body may differ, which this cannot and does not dedupe.
 *
 * A failure to check is itself not fatal to the check: it returns false and
 * the caller reports the original error, which is the safe direction.
 */
async function reviewAlreadyPosted(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber'>,
  token: string,
  body: string,
  fetchImpl: FetchLike,
): Promise<boolean> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}/reviews?per_page=100`;
  try {
    const res = await fetchImpl(url, { headers: authHeaders(token, 'application/vnd.github+json') });
    if (!res.ok) return false;
    const reviews = (await res.json()) as { body?: string }[];
    return Array.isArray(reviews) && reviews.some((r) => r.body === body);
  } catch {
    return false;
  }
}

/** Post a plain issue comment (no review event) — `post_as: 'pr_comment'`. */
export async function postPrComment(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber'>,
  token: string,
  body: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      ...authHeaders(token, 'application/vnd.github+json'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    throw new RunnerError(
      `GitHub API error posting PR comment (${url}): ${res.status} ${await res.text().catch(() => '')}`,
    );
  }
}
