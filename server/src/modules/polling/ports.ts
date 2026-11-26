import type { GitHubClient, PrMeta, Repo } from '@devdigest/shared';

/**
 * F1 — what the manual poll needs. Both stores belong to other modules and are
 * passed in by `platform/container.ts`.
 */

export interface PolledRepos {
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
  /** Record that the repo's PR list was just synced. */
  markPolled(repoId: string): Promise<void>;
}

export interface PullImporter {
  upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void>;
}

/** A resolver, not an instance: the client is built from a token that can change. */
export type GitHubResolver = () => Promise<Pick<GitHubClient, 'listPullRequests'>>;
