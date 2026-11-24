import { RepoNotFound } from '../../_shared/domain/errors.js';
import type { GitHubFor, PollingRepository } from '../domain/ports.js';

export interface PollingDeps {
  repos: PollingRepository;
  github: GitHubFor;
  now: () => Date;
}

export interface PollResult {
  synced: number;
  /** Always false: polling only syncs the PR list, reviews are started manually. */
  reviewTriggered: false;
}

/** F1 — manual refresh of a repo's PR list from GitHub. Never starts a review. */
export class PollingService {
  constructor(private readonly d: PollingDeps) {}

  async poll(workspaceId: string, repoId: string): Promise<PollResult> {
    const repo = await this.d.repos.findRepo(workspaceId, repoId);
    if (!repo) throw new RepoNotFound();
    const gh = await this.d.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    const synced = await this.d.repos.recordPoll(workspaceId, repo.id, pulls, this.d.now());
    return { synced, reviewTriggered: false };
  }
}
