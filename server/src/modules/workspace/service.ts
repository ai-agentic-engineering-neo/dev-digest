/** One cloned repo in the workspace overview (API field names). */
export interface WorkspaceRepoSummary {
  id: string;
  full_name: string;
  clone_path: string | null;
  last_polled_at: string | null;
  cloned: boolean;
}

/** What the overview needs from storage (implemented by WorkspaceRepository). */
export interface WorkspaceRepoStore {
  listRepoSummaries(workspaceId: string): Promise<WorkspaceRepoSummary[]>;
}

/** workspace — application: where clones live + a summary of cloned repos. */
export class WorkspaceService {
  constructor(private readonly deps: { repos: WorkspaceRepoStore; cloneDir: string }) {}

  async overview(workspaceId: string) {
    return {
      workspaceId,
      cloneDir: this.deps.cloneDir,
      repos: await this.deps.repos.listRepoSummaries(workspaceId),
    };
  }
}
