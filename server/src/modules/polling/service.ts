import type { GitHubClient, PrMeta } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { PollingRepository } from './repository.js';

export interface PollResult {
  synced: number;
  /** Always false: polling never triggers a review (review is manual). */
  reviewTriggered: false;
}

export interface PollingServiceDeps {
  polling: Pick<PollingRepository, 'findRepo' | 'markPolled'>;
  /** Resolves the GitHub client; rejects (ConfigError) when no token is configured. */
  github: () => Promise<GitHubClient>;
  /** Persists GitHub's PR-list payload (the pulls module's import); returns the count. */
  importPulls: (workspaceId: string, repoId: string, listed: PrMeta[]) => Promise<number>;
  now?: () => Date;
}

/**
 * F1 — polling. MANUAL refresh that ONLY syncs the PR list (new/updated PRs
 * appear, head_sha updates). It does NOT trigger any review — review is manual
 * (the user presses Run Review, owned by the reviews module).
 */
export class PollingService {
  constructor(private readonly deps: PollingServiceDeps) {}

  async poll(workspaceId: string, repoId: string): Promise<PollResult> {
    const repo = await this.deps.polling.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.deps.github();
    const listed = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    const synced = await this.deps.importPulls(workspaceId, repo.id, listed);
    await this.deps.polling.markPolled(repo.id, (this.deps.now ?? (() => new Date()))());
    return { synced, reviewTriggered: false };
  }
}
