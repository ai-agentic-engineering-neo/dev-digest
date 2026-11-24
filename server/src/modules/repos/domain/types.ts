/** A repository in a workspace. Field names mirror the persisted row. */
export interface Repo {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface NewRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

/** Payload enqueued for (and consumed by) the `clone` job. */
export interface CloneJobPayload {
  repoId: string;
  owner: string;
  name: string;
  /** Kept for old job rows; never cloned from — see RepoService.runCloneJob. */
  url: string;
}
