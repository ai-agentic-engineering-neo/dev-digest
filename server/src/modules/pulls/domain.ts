import type { PrDetail, PrFile, PrCommit, PrMeta, PrStatus } from '@devdigest/shared';

/**
 * Pulls domain (pure — no DB / I/O, so it unit-tests without doubles).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, a review STATUS and the total run cost. The DB `status`
 * column holds GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

/** A persisted pull request (read model the repository hands to the use cases). */
export interface PullRecord {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state (open/merged/closed). */
  status: string;
  body: string | null;
  lastReviewedSha: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

/** The GitHub coordinates of a repo, plus its row id. */
export interface RepoCoords {
  id: string;
  owner: string;
  name: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/** Findings per severity of one review (list FINDINGS column). */
export type FindingsCounts = { CRITICAL: number; WARNING: number; SUGGESTION: number };

/** Review/cost rollup of one PR for the list (all null until reviewed / priced). */
export interface PullRollup {
  /** The PR's newest review — the source of `score` and `lastReviewedAt`. */
  latestReviewId: string | null;
  /** The newest review of each agent — the reviews `findingsCounts` sums; [] until reviewed. */
  latestReviewIds: string[];
  lastReviewedAt: Date | null;
  score: number | null;
  findingsCounts: FindingsCounts | null;
  costUsd: number | null;
}

/** Severity counts summed over several reviews (a review with no findings is `undefined`). */
export function sumCounts(parts: (FindingsCounts | undefined)[]): FindingsCounts {
  const total: FindingsCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const c of parts) {
    if (!c) continue;
    total.CRITICAL += c.CRITICAL;
    total.WARNING += c.WARNING;
    total.SUGGESTION += c.SUGGESTION;
  }
  return total;
}

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

/** PRs imported from GitHub's list payload land with zeroed diff stats. */
export function needsDiffStats(pr: DiffStats): boolean {
  return pr.additions === 0 && pr.deletions === 0 && pr.filesCount === 0;
}

const EMPTY_ROLLUP: PullRollup = {
  latestReviewId: null,
  latestReviewIds: [],
  lastReviewedAt: null,
  score: null,
  findingsCounts: null,
  costUsd: null,
};

/** One row of GET /repos/:id/pulls. */
export function toPrListItem(pr: PullRecord, rollup: PullRollup | undefined, now: number): PrMeta {
  const r = rollup ?? EMPTY_ROLLUP;
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: deriveReviewStatus({
      ghStatus: pr.status,
      lastReviewedSha: pr.lastReviewedSha,
      headSha: pr.headSha,
      updatedAt: pr.updatedAt,
      now,
    }),
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    score: r.score,
    cost_usd: r.costUsd,
    latest_review_id: r.latestReviewId,
    latest_review_ids: r.latestReviewIds,
    last_reviewed_at: r.lastReviewedAt?.toISOString() ?? null,
    findings_counts: r.findingsCounts,
  };
}

/** PR detail served from the local mirror (offline / no GitHub token). */
export function toPersistedPrDetail(pr: PullRecord, files: PrFile[], commits: PrCommit[]): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrStatus,
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body,
    files,
    commits,
  };
}
