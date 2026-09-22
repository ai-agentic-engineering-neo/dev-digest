import type { WorkspaceRepository } from './repository.js';

export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: Array<{
    id: string;
    full_name: string;
    clone_path: string | null;
    last_polled_at: string | null;
    cloned: boolean;
  }>;
}

export interface WorkspaceServiceDeps {
  workspace: Pick<WorkspaceRepository, 'listRepos'>;
  /** Where repo clones live on disk (AppConfig.cloneDir). */
  cloneDir: string;
}

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 * Cleanup/re-pull of individual repos is the repos module's (refresh/delete).
 */
export class WorkspaceService {
  constructor(private readonly deps: WorkspaceServiceDeps) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const repos = await this.deps.workspace.listRepos(workspaceId);
    return {
      workspaceId,
      cloneDir: this.deps.cloneDir,
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
