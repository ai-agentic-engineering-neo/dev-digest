import type { RepoLister } from './ports.js';

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */

export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: {
    id: string;
    full_name: string;
    clone_path: string | null;
    last_polled_at: string | null;
    cloned: boolean;
  }[];
}

export interface WorkspaceServiceDeps {
  repos: RepoLister;
  cloneDir: string;
}

export class WorkspaceService {
  constructor(private deps: WorkspaceServiceDeps) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const repos = await this.deps.repos.list(workspaceId);
    return {
      workspaceId,
      cloneDir: this.deps.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        clone_path: r.clone_path,
        last_polled_at: r.last_polled_at,
        cloned: Boolean(r.clone_path),
      })),
    };
  }
}
