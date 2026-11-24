import type { PrStatus } from '@devdigest/shared';

/** The repo coordinates the pulls use cases need. */
export interface PullRepo {
  id: string;
  owner: string;
  name: string;
}

/** A persisted pull request. `ghStatus` is GitHub's merge state (open/merged/closed). */
export interface StoredPull {
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
  ghStatus: string;
  openedAt: Date | null;
  updatedAt: Date | null;
  lastReviewedSha: string | null;
  body: string | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/** One row of the Pull Requests list. */
export interface PullListItem extends StoredPull {
  reviewStatus: PrStatus;
  /** Latest review's score, null when never reviewed or unscored. */
  score: number | null;
  /** See ./cost.ts; null = no known cost. */
  costUsd: number | null;
}

/** Diff-stat backfill per list request — each one is a GitHub detail fetch. */
export const BACKFILL_LIMIT = 10;

/** GitHub's list payload has no diff stats, so freshly imported PRs show zeros. */
export function needsStatsBackfill(p: StoredPull): boolean {
  return p.additions === 0 && p.deletions === 0 && p.filesCount === 0;
}
