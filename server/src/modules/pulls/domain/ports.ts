import type { GitHubClient, PrDetail, PrMeta } from '@devdigest/shared';
import type { RunCostRow } from './cost.js';
import type { DiffStats, PullRepo, StoredPull } from './types.js';

export interface PullsRepository {
  findRepo(workspaceId: string, repoId: string): Promise<PullRepo | undefined>;
  /** Repo of an already workspace-checked PR. */
  repoOf(pull: StoredPull): Promise<PullRepo | undefined>;
  findPull(workspaceId: string, pullId: string): Promise<StoredPull | undefined>;
  listForRepo(repoId: string): Promise<StoredPull[]>;

  /** Upsert GitHub's PR list (new PRs inserted; title/head/status/updated_at refreshed). */
  upsertFromList(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void>;
  updateStats(pullId: string, stats: DiffStats): Promise<void>;
  /** Replace files/commits and refresh body + stats from a fresh detail, atomically. */
  storeDetail(pullId: string, detail: PrDetail): Promise<void>;
  /** Persisted files/commits/body as a PrDetail (offline fallback). */
  persistedDetail(pull: StoredPull): Promise<PrDetail>;

  /** Latest `review`-kind score per PR. */
  latestScores(pullIds: string[]): Promise<Map<string, number | null>>;
  /** Agent runs for these PRs, newest first (input for aggregatePrCosts). */
  runCosts(workspaceId: string, pullIds: string[]): Promise<RunCostRow[]>;
}

export type GitHubFor = () => Promise<GitHubClient>;
