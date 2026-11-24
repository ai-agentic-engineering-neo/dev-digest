import type { WorkspaceRepository } from '../domain/ports.js';
import type { WorkspaceOverview } from '../domain/types.js';

export interface WorkspaceDeps {
  repos: WorkspaceRepository;
  /** Where clones live on disk (from config). */
  cloneDir: string;
}

/** F1 — workspace manager: where clones live + a summary of the workspace's repos. */
export class WorkspaceService {
  constructor(private readonly d: WorkspaceDeps) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    return { workspaceId, cloneDir: this.d.cloneDir, repos: await this.d.repos.listRepos(workspaceId) };
  }
}
