import type { GitHubClient, PrMeta } from '@devdigest/shared';

/** The repo coordinates polling needs. */
export interface PolledRepo {
  id: string;
  owner: string;
  name: string;
}

export interface PollingRepository {
  findRepo(workspaceId: string, repoId: string): Promise<PolledRepo | undefined>;
  /**
   * Upsert the PR list and stamp `last_polled_at` atomically. Existing PRs get
   * title/head/status/updated_at refreshed. Returns how many PRs were synced.
   */
  recordPoll(workspaceId: string, repoId: string, pulls: PrMeta[], polledAt: Date): Promise<number>;
}

export type GitHubFor = () => Promise<Pick<GitHubClient, 'listPullRequests'>>;
