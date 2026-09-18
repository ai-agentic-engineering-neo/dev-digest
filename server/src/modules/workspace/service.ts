import type { Container } from '../../platform/container.js';
import { WorkspaceRepository } from './repository.js';

export interface WorkspaceRepoSummary {
  id: string;
  full_name: string;
  clone_path: string | null;
  last_polled_at: string | null;
  cloned: boolean;
}

export interface WorkspaceSummary {
  workspaceId: string;
  cloneDir: string;
  repos: WorkspaceRepoSummary[];
}

/**
 * F1 — workspace service. Where clones live + a summary of cloned repos.
 * No HTTP and no raw SQL live here — persistence goes through WorkspaceRepository.
 */
export class WorkspaceService {
  private repo: WorkspaceRepository;

  constructor(private container: Container) {
    this.repo = new WorkspaceRepository(container.db);
  }

  async getSummary(workspaceId: string): Promise<WorkspaceSummary> {
    const repos = await this.repo.listRepos(workspaceId);
    return {
      workspaceId,
      cloneDir: this.container.config.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        clone_path: r.clonePath,
        last_polled_at: r.lastPolledAt?.toISOString() ?? null,
        cloned: Boolean(r.clonePath),
      })),
    };
  }
}
