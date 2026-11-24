import type { WorkspaceRepo } from './types.js';

export interface WorkspaceRepository {
  listRepos(workspaceId: string): Promise<WorkspaceRepo[]>;
}
