import type { FeatureModelChoice, LLMProvider, Provider as ProviderId } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';

/**
 * Narrow local ports (`server/LEARNINGS.md`'s local-port rule) — this module
 * codes against these, never against another module's real class. No import
 * from `modules/repo-intel/**`, `modules/repos/**` etc. anywhere in this file
 * (`no-cross-module`, including `import type`); `RepoIntelService` and
 * `RepoRepository` satisfy these structurally when wired at `routes.ts`.
 */

/** The three additive facade reads (D7/§1b) plus `getIndexState` — declared
 *  locally, structurally satisfied by `RepoIntelService`. Field/return shapes
 *  are copied from `repo-intel/types.ts`, not imported from it. */
export interface RepoIntelWeightedFile {
  path: string;
  pagerank: number;
  hotness: number;
  weighted: number;
  percentile: number;
}

export interface RepoIntelIndexState {
  status: string;
  reason?: string;
  lastIndexedSha: string;
  indexerVersion: number;
  updatedAt: Date;
  filesIndexed: number;
  filesSkipped: number;
  filesExcludedByBound?: number;
  hotnessPrs?: number;
  hotnessWindowDays?: number;
  graphFailed?: string;
  degraded?: boolean;
}

export interface RepoIntelPort {
  getIndexState(repoId: string): Promise<RepoIntelIndexState>;
  getWeightedRankedFiles(
    repoId: string,
    n: number,
    opts?: { exclude?: string[] },
  ): Promise<RepoIntelWeightedFile[]>;
  getCriticalPaths(
    repoId: string,
    opts?: { order?: 'rank' | 'weighted'; roots?: number },
  ): Promise<string[][]>;
  getFileFacts(
    repoId: string,
    paths: string[],
  ): Promise<Array<{ file: string; endpoints: string[]; crons: string[] }>>;
}

/** A repo, as far as generation needs it — mirrors `conventions/service.ts`'s
 *  `RepoLookup`. `RepoRepository.getById` satisfies this structurally. */
export interface RepoLookup {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<
    { id: string; owner: string; name: string; fullName: string; clonePath: string | null } | undefined
  >;
}

/** The workspace's chosen provider+model for the `onboarding` feature. */
export type FeatureModelResolver = (
  workspaceId: string,
  id: 'onboarding',
) => Promise<FeatureModelChoice>;

/** Resolve an LLM provider by id — the container supplies its own cached,
 *  secret-backed resolver at the composition root. */
export type LlmResolver = (id: ProviderId) => Promise<LLMProvider>;

export type { Tokenizer };
