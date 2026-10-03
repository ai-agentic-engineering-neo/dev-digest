import type { Container } from '../../platform/container.js';
import { PollingRepository } from './repository.js';
import { PullsService } from '../pulls/service.js';

export interface PollResult {
  synced: number;
  reviewTriggered: false;
}

/**
 * F1 — polling service. MANUAL refresh that ONLY syncs the PR list (new/
 * updated PRs appear, head_sha updates) — it never triggers a review (review
 * is manual, owned by the reviews module). Composes PullsService so the
 * GitHub-PR sync/upsert logic lives in exactly one place (pulls/service.ts),
 * not duplicated here.
 */
export class PollingService {
  private repo: PollingRepository;
  private pulls: PullsService;

  constructor(private container: Container) {
    this.repo = new PollingRepository(container.db);
    this.pulls = new PullsService(container);
  }

  async poll(workspaceId: string, repoId: string): Promise<PollResult> {
    const repo = await this.pulls.findRepo(workspaceId, repoId);
    // Unlike the PR-list read (best-effort/offline-tolerant), a manual poll
    // requires GitHub to be configured — a missing token surfaces as an error.
    const gh = await this.container.github();
    const synced = await this.pulls.syncFromGitHub(gh, workspaceId, repo);
    await this.repo.touchLastPolled(repo.id);
    return { synced, reviewTriggered: false };
  }
}
