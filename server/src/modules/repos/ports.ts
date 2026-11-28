import type { GitClient, Repo } from '@devdigest/shared';

/**
 * F1 — what RepoService needs from the outside world. The service depends on
 * these interfaces only; `routes.ts` wires the real implementations and tests
 * pass in-memory fakes.
 */

export interface NewRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

/** Persistence for repos. Implemented by `RepoRepository` (Drizzle). */
export interface RepoStore {
  /** Find a repo in a workspace by its `owner/name` full name (dedupe on add). */
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  list(workspaceId: string): Promise<Repo[]>;
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
  insert(values: NewRepo): Promise<Repo>;
  /** The workspace owning a repo, or null if the repo no longer exists. */
  workspaceIdFor(repoId: string): Promise<string | null>;
  /** Record where the clone landed and that the repo was just polled. */
  markCloned(repoId: string, clonePath: string): Promise<void>;
  /** False when there was nothing to remove. */
  remove(workspaceId: string, id: string): Promise<boolean>;
}

/** Background jobs. Implemented by `JobRunner` (platform/jobs.ts). */
export interface JobQueue {
  register(kind: string, handler: (payload: unknown) => Promise<void>): void;
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
}

/** The git operations this module uses. */
export type RepoCloner = Pick<GitClient, 'clone' | 'removeClone'>;
