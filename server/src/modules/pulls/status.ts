import type { PrStatus } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
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

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/** Max short finding cards per PR in the list's FINDINGS hover popover. */
export const FINDINGS_PREVIEW_LIMIT = 5;

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export interface FindingPreviewRow {
  severity: string;
  title: string;
  file: string;
  startLine: number;
  confidence: number;
}

/**
 * The few findings worth previewing on the PR list: most severe first, then
 * most confident. Unknown severities are dropped (the contract's enum would
 * reject them).
 */
export function topFindings(
  rows: FindingPreviewRow[],
  limit = FINDINGS_PREVIEW_LIMIT,
): { severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION'; title: string; file: string; start_line: number }[] {
  return rows
    .filter((r) => r.severity in SEVERITY_RANK)
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.severity]! - SEVERITY_RANK[b.severity]! || b.confidence - a.confidence)
    .slice(0, limit)
    .map((r) => ({
      severity: r.severity as 'CRITICAL' | 'WARNING' | 'SUGGESTION',
      title: r.title,
      file: r.file,
      start_line: r.startLine,
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
