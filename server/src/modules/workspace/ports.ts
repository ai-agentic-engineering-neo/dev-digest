import type { Repo } from '@devdigest/shared';

/**
 * What the workspace overview needs from the repos module. Declared here, by
 * the consumer; `platform/container.ts` passes in the repos repository, which
 * satisfies it structurally.
 */
export interface RepoLister {
  list(workspaceId: string): Promise<Repo[]>;
}
