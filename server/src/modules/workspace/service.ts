import type { WorkspaceRepoSummary } from './repository.js';

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
