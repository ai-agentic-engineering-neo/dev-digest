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

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

export interface AgentPayload {
  /** The agent's own name, from its validated manifest. */
  agent: string;
  payload: GitHubReviewPayload;
  gateTriggered: boolean;
  blockers: number;
  /** Grounded-finding totals for this agent, so the merged body can lead with
   *  numbers without re-parsing the rendered markdown underneath it. */
  findingsCount: number;
  counts: SeverityCounts;
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
    const mark = statusMark(r);
    return `${mark} ${r.agent}`;
  });
  return parts.join(' · ');
}

function statusMark(r: AgentPayload): string {
  return r.gateTriggered ? '🔴' : r.payload.event === 'APPROVE' ? '✅' : '🟡';
}

function countsLine(findingsCount: number, c: SeverityCounts): string {
  return `**${findingsCount} finding${findingsCount === 1 ? '' : 's'}** · ${c.critical} critical · ${c.warning} warning · ${c.suggestion} suggestion`;
}

function totals(results: readonly AgentPayload[]): { findingsCount: number; counts: SeverityCounts } {
  return {
    findingsCount: results.reduce((n, r) => n + r.findingsCount, 0),
    counts: {
      critical: results.reduce((n, r) => n + r.counts.critical, 0),
      warning: results.reduce((n, r) => n + r.counts.warning, 0),
      suggestion: results.reduce((n, r) => n + r.counts.suggestion, 0),
    },
  };
}

/**
 * Each agent's findings, COLLAPSED behind a `<details>` summary.
 *
 * The full list is kept rather than replaced by a summary, because it is not
 * redundant with the inline comments: a finding whose line the diff cannot
 * anchor is dropped from the inline set by `toReviewPayload` and survives
 * ONLY here. Collapsing keeps it reachable without making the top of the PR a
 * page of text that repeats what is already annotated on the lines.
 *
 * The blank lines around the body are load-bearing: GitHub does not render
 * markdown inside `<details>` without them.
 */
function collapsedSection(r: AgentPayload): string {
  const summary = `${statusMark(r)} <strong>${r.agent}</strong> — ${r.findingsCount} finding${
    r.findingsCount === 1 ? '' : 's'
  } · ${r.counts.critical} critical · ${r.counts.warning} warning · ${r.counts.suggestion} suggestion`;
  return `<details>\n<summary>${summary}</summary>\n\n${r.payload.body}\n\n</details>`;
}

/**
 * Compose the posted review: a short, always-visible header (who ran, what
 * the totals are, where the detail lives), then one collapsed section per
 * agent. A single agent is NOT a separate shape — it is the one-element case
 * of the same layout.
 */
export function mergeAgentReviews(results: readonly AgentPayload[]): MergedReview {
  if (results.length === 0) {
    throw new Error('mergeAgentReviews requires at least one agent result');
  }

  const event = mergedEvent(results);
  const blockers = results.reduce((n, r) => n + r.blockers, 0);
  const { findingsCount, counts } = totals(results);

  const title =
    results.length === 1
      ? `## DevDigest — ${results[0]!.agent}`
      : `## DevDigest — ${results.length} reviewers`;

  const header = [
    title,
    rosterLine(results),
    countsLine(findingsCount, counts),
    findingsCount > 0
      ? '_Findings are posted as inline comments on the lines they refer to. Expand a reviewer below for its full list._'
      : '_No findings. Looks good._',
  ].join('\n\n');

  const body = [header, ...results.map(collapsedSection)].join('\n\n');

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
