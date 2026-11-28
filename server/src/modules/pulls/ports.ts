import type { GitHubClient, PrDetail, PrMeta, Repo } from '@devdigest/shared';

/**
 * F1 — what the pulls use cases need from the outside world.
 */

/** A pull request as persisted. `ghStatus` is GitHub's merge state. */
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
  lastReviewedSha: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
  body: string | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/** Persistence for pull requests, their files and commits. */
export interface PullStore {
  /** Import PRs from GitHub: insert new ones, refresh title/head/status of known ones. */
  upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void>;
  listForRepo(repoId: string): Promise<StoredPull[]>;
  getById(workspaceId: string, id: string): Promise<StoredPull | undefined>;
  setDiffStats(pullId: string, stats: DiffStats): Promise<void>;
  /** Replace the PR's files and commits and store its body + diff stats, atomically. */
  saveDetail(pullId: string, detail: PrDetail): Promise<void>;
  /** The persisted files and commits (served when GitHub is unreachable). */
  filesAndCommits(pullId: string): Promise<Pick<PrDetail, 'files' | 'commits'>>;
}

/** The repos module, as far as pulls needs it. Satisfied by the repos repository. */
export interface RepoLookup {
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
}

/** Review data for the PR list, owned by the reviews module. */
export interface ReviewRollups {
  /** Reviews (kind = 'review') of these PRs, newest first. */
  reviewRefsForPulls(
    prIds: string[],
  ): Promise<{ id: string; prId: string; agentId: string | null; score: number | null }[]>;
  findingSeverities(reviewIds: string[]): Promise<{ reviewId: string; severity: string }[]>;
  /** Stored run costs for these PRs; runs with an unknown cost are absent. */
  runCostsForPulls(prIds: string[]): Promise<{ prId: string; costUsd: number }[]>;
}

export type PullsGitHub = Pick<
  GitHubClient,
  'listPullRequests' | 'getPullRequest' | 'listReviewComments' | 'createReviewComment'
>;

/** A resolver, not an instance: the client is built from a token that can change. */
export type GitHubResolver = () => Promise<PullsGitHub>;

export interface Logger {
  warn(obj: object, msg: string): void;
}
