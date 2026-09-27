import type { PrStatus, PrFindingPreview } from '@devdigest/shared';
import { scoreFromFindings } from '@devdigest/reviewer-core';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest run's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) over any set of
 *  findings — one review's, or every review of a multi-agent run. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/**
 * The list's SCORE for one run: the engine's own `scoreFromFindings` over the
 * same findings the FINDINGS counters tally — every agent of the run, so a
 * problem two agents both flag is charged twice, exactly as it is counted
 * twice — except dismissed ones: the counters keep showing a dismissed finding,
 * but it no longer costs points.
 */
export function runScore(rows: { severity: string; dismissedAt: Date | null }[]): number {
  return scoreFromFindings(rows.filter((r) => r.dismissedAt == null));
}

/** Agent-run statuses that end without the agent's findings. `running` is not
 *  one: it is transient, and the list refetches until the run settles. */
const INCOMPLETE_RUN_STATUSES = new Set(['failed', 'cancelled']);

/** True when an agent of the run failed or was cancelled — the score then
 *  covers only the agents that finished (the list's "partial" marker). */
export function isPartialRun(statuses: (string | null)[]): boolean {
  return statuses.some((s) => s != null && INCOMPLETE_RUN_STATUSES.has(s));
}

/**
 * How many findings of the latest RUN ride along on the PR list, for the
 * FINDINGS column's hover popover. The popover shows the worst few; its title
 * shows the true `total`, which is why the cap is not a lie.
 *
 * Raised from 5 when the rollup became a union over every agent of the run: a
 * three-agent run routinely clears 5 findings, and a popover that truncated
 * almost every row would not answer "what did this run find". It is still a
 * CAP, not a promise to ship everything — the list is refetched every 60s with
 * one rollup per PR, so this bounds that payload; overflow is reported as
 * "+N more on the PR page" rather than silently dropped.
 */
export const PR_FINDING_PREVIEW_LIMIT = 30;

/** Max characters of a rationale carried to the list. */
export const PR_FINDING_DESCRIPTION_MAX = 160;

/** Severity rank for "worst first" preview ordering. */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * Flatten a markdown rationale to one truncated plain-text line. The popover is
 * a preview, not a reader: no markdown is rendered there, so strip the syntax
 * here rather than shipping bytes the UI will never use.
 *
 * Strips block markers only at the START of a line, and never strips `_`, `>`
 * or `#` globally: this is a CODE review tool, so rationales are full of
 * snake_case identifiers, `=>` and `#482`, and a global strip silently mangles
 * them (`sk_live_` → `sklive`).
 */
export function previewDescription(rationale: string): string {
  const flat = rationale
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks carry no summary value
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+)/gm, '') // LEADING block markers only
    .replace(/\*\*?/g, '') // bold / italic asterisks
    .replace(/`/g, '') // inline code fences
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= PR_FINDING_DESCRIPTION_MAX) return flat;
  const cut = flat.slice(0, PR_FINDING_DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  // Cut on a word boundary, but never throw away most of the line to find one.
  const body = lastSpace > PR_FINDING_DESCRIPTION_MAX * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/** A findings row as this module needs it (a structural subset of FindingRow). */
export interface PreviewableFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
  confidence: number;
}

/**
 * Worst-first, capped previews of a run's findings (one review's, or the union
 * over every agent of a run — this is a pure sort + cap either way).
 *
 * Off-enum severities are DROPPED: `findings.severity` is free text in the DB,
 * and the list can only render the three shipped severities. `rollupSeverities`
 * ignores them too, so `sum(by_severity) <= total` by design.
 */
export function toFindingPreviews(rows: PreviewableFinding[]): PrFindingPreview[] {
  return rows
    .filter((r) => SEVERITY_RANK[r.severity] != null)
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity]! - SEVERITY_RANK[b.severity]! ||
        b.confidence - a.confidence ||
        // Stable tiebreak — without it the preview order is whatever the DB
        // happened to return, which makes the integration test flaky.
        a.id.localeCompare(b.id),
    )
    .slice(0, PR_FINDING_PREVIEW_LIMIT)
    .map((r) => ({
      id: r.id,
      severity: r.severity as PrFindingPreview['severity'],
      category: r.category as PrFindingPreview['category'],
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      description: previewDescription(r.rationale),
    }));
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
