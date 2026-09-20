import type { PrMeta, PrFile, PrCommit } from '@devdigest/shared';

/**
 * Domain shapes for this module (ring 2 — no I/O). Deliberately NOT the raw
 * Drizzle row types (`typeof t.pullRequests.$inferSelect`) — those belong in
 * `repository.ts` only; row → domain mapping happens there via a named mapper
 * (see `.claude/skills/onion-architecture/rules/drizzle.md` rule 3-4).
 */

export interface RepoRef {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
}

export interface PullRecord {
  id: string;
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface PrFileRecord {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrCommitRecord {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

/** One row of the `reviews` rollup query (`kind='review'` reviews for a set of PRs). */
export interface ReviewRollupRow {
  id: string;
  prId: string;
  agentId: string | null;
  score: number | null;
  verdict: string | null;
}

export interface FindingSeverityRow {
  prId: string;
  severity: string;
}

export interface RunCostRow {
  prId: string;
  costUsd: number | null;
}

export interface PullsRepo {
  getRepoForWorkspace(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
  getRepoById(repoId: string): Promise<RepoRef | undefined>;
  /**
   * The one shared PR upsert (insert + onConflictDoUpdate), used by both the
   * pulls-list sync and the manual poll endpoint. `onConflictDoUpdate` never
   * touches `openedAt`, so it only matters on a brand-new row's first insert.
   * `setOpenedAt` preserves a pre-existing difference between the two call
   * sites: the pulls-list sync sets it from `pr.opened_at`, the manual poll
   * historically did not — kept as an explicit flag rather than silently
   * unified, since changing it changes what a poll-first PR's `opened_at`
   * ends up as.
   */
  upsertPullRequestFromList(
    workspaceId: string,
    repoId: string,
    pr: PrMeta,
    opts?: { setOpenedAt?: boolean },
  ): Promise<void>;
  listPullsForRepo(repoId: string): Promise<PullRecord[]>;
  updatePullDiffStats(
    pullId: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void>;
  reviewRollupForPulls(prIds: string[]): Promise<ReviewRollupRow[]>;
  findingSeveritiesForReviewIds(reviewIds: string[]): Promise<FindingSeverityRow[]>;
  completedRunCostsForPulls(prIds: string[]): Promise<RunCostRow[]>;
  getPullForWorkspace(workspaceId: string, pullId: string): Promise<PullRecord | undefined>;
  /** Atomic replace of a PR's files + commits (one transaction). */
  replacePrFilesAndCommits(pullId: string, files: PrFile[], commits: PrCommit[]): Promise<void>;
  updatePullDetail(
    pullId: string,
    fields: { body: string | null; additions: number; deletions: number; filesCount: number },
  ): Promise<void>;
  getPrFilesAndCommits(
    pullId: string,
  ): Promise<{ files: PrFileRecord[]; commits: PrCommitRecord[] }>;
  touchRepoPolledAt(repoId: string): Promise<void>;
}
