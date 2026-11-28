import { NotFoundError } from '../../platform/errors.js';
import type { GitHubResolver, PolledRepos, PullImporter } from './ports.js';

/**
 * F1 — polling. MANUAL refresh that ONLY syncs the PR list (new/updated PRs
 * appear, head_sha updates). It does NOT trigger any review — review is manual
 * (user presses Run Review, owned by A2).
 */

export interface PollingServiceDeps {
  repos: PolledRepos;
  pulls: PullImporter;
  github: GitHubResolver;
}

export class PollingService {
  constructor(private deps: PollingServiceDeps) {}

  async pollRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ synced: number; reviewTriggered: false }> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    await this.deps.pulls.upsertFromGitHub(workspaceId, repo.id, pulls);
    await this.deps.repos.markPolled(repo.id);

    // NOTE: no review is triggered here — manual trigger only.
    return { synced: pulls.length, reviewTriggered: false };
  }
}
