/**
 * blast ports (ring 1): plain DTOs, the repository contract and the structural
 * slice of the repo-intel facade the service reads. Modules never import each
 * other, so the facade's `BlastResult` is re-declared here field by field; the
 * container hands the real facade in and TypeScript checks the shape.
 */
import type { BlastDegradedReason } from '@devdigest/shared';

/** What the service needs to know about the PR before asking the index. */
export interface BlastPrInputs {
  prId: string;
  repoId: string;
  headSha: string;
  /** Persisted PR file paths (written by GET /pulls/:id). */
  changedPaths: string[];
}

/** Another PR of the same repository whose files overlap the current one. */
export interface PriorPull {
  number: number;
  title: string;
  author: string;
  openedAt: Date | null;
  updatedAt: Date | null;
  body: string | null;
  /** Paths shared with the current PR, in path order. */
  filesOverlap: string[];
}

export interface BlastRepositoryPort {
  /** undefined = the PR does not exist in this workspace. */
  getInputs(workspaceId: string, prId: string): Promise<BlastPrInputs | undefined>;
  /** Other PRs of `repoId` touching any of `paths`, newest first, at most `limit`. */
  getPriorPulls(
    workspaceId: string,
    repoId: string,
    excludePrId: string,
    paths: string[],
    limit: number,
  ): Promise<PriorPull[]>;
}

// ---- repo-intel facade slice (mirrors modules/repo-intel/types.ts BlastResult) ----

export interface IntelChangedSymbol {
  file: string;
  name: string;
  kind: string;
}

export interface IntelCaller {
  file: string;
  /** Enclosing function / class of the reference (file name when unknown). */
  symbol: string;
  /** Which changed symbol this caller reaches. */
  viaSymbol: string;
  line: number;
  rank: number;
}

export interface IntelFileFacts {
  endpoints: string[];
  crons: string[];
}

export interface IntelBlastResult {
  changedSymbols: IntelChangedSymbol[];
  callers: IntelCaller[];
  /** Flat "METHOD /path" union; the only endpoint data on the ripgrep fallback. */
  impactedEndpoints: string[];
  /** Per caller file, present on the persistent-index path only. */
  factsByFile?: Record<string, IntelFileFacts>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}

export interface BlastIntelPort {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<IntelBlastResult>;
}

export interface BlastDeps {
  repo: BlastRepositoryPort;
  intel: BlastIntelPort;
}
