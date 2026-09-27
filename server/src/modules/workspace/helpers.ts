/** A repo as the workspace overview sees it. `isCloned` is the rule, stated once. */
export interface WorkspaceRepoSummary {
  id: string;
  fullName: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
  isCloned: boolean;
}

export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: WorkspaceRepoSummary[];
}

/** Domain -> wire. JSON on the wire is snake_case. */
export function workspaceToDto(overview: WorkspaceOverview) {
  return {
    workspaceId: overview.workspaceId,
    cloneDir: overview.cloneDir,
    repos: overview.repos.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      clone_path: r.clonePath,
      last_polled_at: r.lastPolledAt?.toISOString() ?? null,
      cloned: r.isCloned,
    })),
  };
}
