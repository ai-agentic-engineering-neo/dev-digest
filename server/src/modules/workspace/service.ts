import type { WorkspaceOverview } from './helpers.js';

/**
 * What this module needs from repo storage. Declared here, by the consumer, so
 * the service depends on a capability rather than on the repos module's data
 * layer; `RepoRepository` satisfies it structurally.
 */
export interface WorkspaceRepoReader {
  list(workspaceId: string): Promise<
    {
      id: string;
      fullName: string;
      clonePath: string | null;
      lastPolledAt: Date | null;
    }[]
  >;
}

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 * Cleanup/re-pull of individual repos is owned by the repos module.
 */
export class WorkspaceService {
  constructor(
    private readonly repos: WorkspaceRepoReader,
    private readonly cloneDir: string,
  ) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const repos = await this.repos.list(workspaceId);
    return {
      workspaceId,
      cloneDir: this.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        clonePath: r.clonePath,
        lastPolledAt: r.lastPolledAt,
        isCloned: Boolean(r.clonePath),
      })),
    };
  }
}
