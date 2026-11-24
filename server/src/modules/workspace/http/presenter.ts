import type { WorkspaceInfo } from '@devdigest/shared';
import { isCloned, type WorkspaceOverview } from '../domain/types.js';

export function presentWorkspace(o: WorkspaceOverview): WorkspaceInfo {
  return {
    workspaceId: o.workspaceId,
    cloneDir: o.cloneDir,
    repos: o.repos.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      clone_path: r.clonePath,
      last_polled_at: r.lastPolledAt?.toISOString() ?? null,
      cloned: isCloned(r),
    })),
  };
}
