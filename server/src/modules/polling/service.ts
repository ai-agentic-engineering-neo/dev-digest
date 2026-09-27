import type { GitHubClient, PrMeta } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';

/** The repo lookup this module needs — declared by the consumer, not imported. */
export interface PollingRepoReader {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; owner: string; name: string } | undefined>;
  touchPolledAt(repoId: string): Promise<void>;
}

/** The PR upsert this module needs; the pulls repository satisfies it structurally. */
export interface PollingPullWriter {
  upsertFromGitHub(workspaceId: string, repoId: string, pr: PrMeta): Promise<void>;
}

/**
 * F1 — polling use case. MANUAL refresh that ONLY syncs the PR list (new and
 * updated PRs appear, head_sha updates). It does NOT trigger any review —
 * review is manual and owned by the reviews module.
 */
export class PollingService {
  constructor(
    private readonly repos: PollingRepoReader,
    private readonly pulls: PollingPullWriter,
    private readonly github: () => Promise<GitHubClient>,
  ) {}

  async pollRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ synced: number; reviewTriggered: false }> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    for (const pr of pulls) {
      await this.pulls.upsertFromGitHub(workspaceId, repo.id, pr);
    }
    await this.repos.touchPolledAt(repo.id);

    return { synced: pulls.length, reviewTriggered: false };
  }
}
