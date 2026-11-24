import type { Repo as RepoDto } from '@devdigest/shared';
import type { Repo } from '../domain/types.js';

export function presentRepo(r: Repo): RepoDto {
  return {
    id: r.id,
    workspace_id: r.workspaceId,
    owner: r.owner,
    name: r.name,
    full_name: r.fullName,
    default_branch: r.defaultBranch,
    clone_path: r.clonePath,
    last_polled_at: r.lastPolledAt?.toISOString() ?? null,
    created_by: r.createdBy,
  };
}
