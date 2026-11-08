import type { BlastIndexSnapshot, BlastIntelResult } from './domain/types.js';

/** Workspace-scoped PR lookup (satisfied structurally by `container.reviewRepo`). */
export interface BlastPullSource {
  getPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string; headSha: string } | undefined>;
}

/** Storage for the blast module. Every query is filtered by workspace. */
export interface BlastRepositoryPort {
  listChangedPaths(workspaceId: string, prId: string): Promise<string[]>;
}

/** The slice of the repo-intel facade (`container.repoIntel`) this module consumes. */
export interface BlastIntelPort {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastIntelResult>;
  getIndexState(repoId: string): Promise<BlastIndexSnapshot>;
}
