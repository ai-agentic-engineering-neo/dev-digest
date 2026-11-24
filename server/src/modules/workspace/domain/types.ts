/** A repo as the workspace overview sees it. */
export interface WorkspaceRepo {
  id: string;
  fullName: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
}

export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: WorkspaceRepo[];
}

/** A repo counts as cloned once it has a clone path on disk. */
export function isCloned(repo: WorkspaceRepo): boolean {
  return Boolean(repo.clonePath);
}
