import type { GitHubReviewPayload } from '@devdigest/shared';

/**
 * Merges the per-agent review payloads of ONE multi-agent CI run into the
 * single review the workflow posts (one job → one review), and derives the
 * run's gate from them.
 *
 * Why merging happens here and not in `reviewer-core`: `toReviewPayload` is
 * the shared studio/CI formatter for ONE agent's review, and stays that.
 * "Several reviewers share one pull request" is a CI-deployment concern, so
 * the composition lives in the runner, on top of the unchanged per-agent
 * payloads — each of which was already computed with that agent's OWN
 * `ci_fail_on` (AC-23's deterministic gate is per agent, never re-derived
 * from a merged finding list under some blended policy).
 *
 * Gate semantics: a STRICT OR. The job fails if any single agent's gate
 * tripped, so adding a lenient reviewer can never soften a strict one.
 */

export interface AgentPayload {
  /** The agent's own name, from its validated manifest. */
  agent: string;
  payload: GitHubReviewPayload;
  gateTriggered: boolean;
  blockers: number;
}

export interface MergedReview {
  payload: GitHubReviewPayload;
  gateTriggered: boolean;
  /** Sum of every agent's own blocker count (AC-23 per agent, summed). */
  blockers: number;
}

/**
 * The merged review EVENT, from the same three-way rule a single agent uses,
 * lifted across agents: any gate tripped → REQUEST_CHANGES; otherwise any
 * agent had something to say → COMMENT; otherwise → APPROVE.
 *
 * Read off the per-agent `event`/`gateTriggered` values rather than
 * re-counting findings — those were already decided deterministically, and
 * re-deriving them here would be a second, drift-prone source of truth.
 */
function mergedEvent(results: readonly AgentPayload[]): GitHubReviewPayload['event'] {
  if (results.some((r) => r.gateTriggered)) return 'REQUEST_CHANGES';
  if (results.some((r) => r.payload.event !== 'APPROVE')) return 'COMMENT';
  return 'APPROVE';
}

/** A one-line roster so a reader sees which reviewers ran — including the
 *  ones that found nothing, whose silence is otherwise indistinguishable
 *  from never having run. */
function rosterLine(results: readonly AgentPayload[]): string {
  const parts = results.map((r) => {
    const mark = r.gateTriggered ? '🔴' : r.payload.event === 'APPROVE' ? '✅' : '🟡';
    return `${mark} ${r.agent}`;
  });
  return parts.join(' · ');
}

/**
 * Compose the posted review. A single agent is NOT special-cased into a
 * different shape by accident: with one entry the body is that agent's own
 * body plus a one-line roster header, so the single-agent output stays the
 * familiar one.
 */
export function mergeAgentReviews(results: readonly AgentPayload[]): MergedReview {
  if (results.length === 0) {
    throw new Error('mergeAgentReviews requires at least one agent result');
  }

  const event = mergedEvent(results);
  const blockers = results.reduce((n, r) => n + r.blockers, 0);

  const header =
    results.length === 1
      ? `_DevDigest — ${rosterLine(results)}_`
      : `## DevDigest — ${results.length} reviewers\n\n${rosterLine(results)}`;

  const body = [header, ...results.map((r) => r.payload.body)].join('\n\n---\n\n');

  // Inline comments carry the agent's name because a merged review shows
  // several reviewers' comments side by side on the same lines; without the
  // attribution a reader cannot tell which reviewer to argue with.
  const comments = results.flatMap((r) =>
    (r.payload.comments ?? []).map((c) => ({ ...c, body: `**${r.agent}** · ${c.body}` })),
  );

  return {
    payload: { body, event, ...(comments.length ? { comments } : {}) },
    gateTriggered: results.some((r) => r.gateTriggered),
    blockers,
  };
}
