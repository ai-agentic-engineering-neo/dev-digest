import type { GitClient } from '@devdigest/shared';
import type { NewRepo, Repo } from './types.js';

/** Persistence for `repos`; every workspace-facing query is tenancy-scoped. */
export interface ReposRepository {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  list(workspaceId: string): Promise<Repo[]>;
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
  insert(values: NewRepo): Promise<Repo>;
  /**
   * Owning workspace by repo id, unscoped — only the clone job uses it, with a
   * payload that came out of an authenticated add(). Null if deleted since.
   */
  workspaceIdFor(repoId: string): Promise<string | null>;
  /** Persist the clone path and stamp last_polled_at. */
  recordClone(repoId: string, clonePath: string, at: Date): Promise<void>;
  /** False when no such repo exists in the workspace. */
  remove(workspaceId: string, id: string): Promise<boolean>;
}

export type RepoCloner = Pick<GitClient, 'clone'>;
