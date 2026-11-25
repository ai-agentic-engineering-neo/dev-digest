/**
 * RepoIntelService — the repo-intel read/index facade (`container.repoIntel`).
 *
 * A thin facade: every method delegates to a use-case file in this folder —
 *   - indexing.ts — indexRepo / refreshIndex / resyncRepo / job handlers / getIndexState
 *   - blast.ts    — getBlastRadius (persistent index, else degraded ripgrep best-effort)
 *   - callers.ts  — getCallerSignatures (callers-in-prompt fuel)
 *   - phantoms.ts — getUnresolvedReferences (phantom-API gate fuel)
 *   - ranking.ts  — getRepoMap, getFileRank, getSymbolsInFiles, getConventionSamples,
 *                   getTopFilesByRank, getCriticalPaths
 * Every read degrades (empty / `degraded: true`) instead of throwing — see types.ts.
 *
 * The constructor takes a narrow deps object (RepoIntelDeps, deps.ts), built by
 * the composition root (platform/container.ts) — never the Container itself.
 */
import type { RepoIntelDeps } from './deps.js';
import type {
  BlastResult,
  FileRankRow,
  IndexResult,
  IndexState,
  RefRow,
  RepoIntel,
  RepoMapResult,
  SignatureRow,
  SymbolRow,
} from './types.js';
import { MAX_CALLERS_PER_SYMBOL } from './constants.js';
import * as indexing from './indexing.js';
import * as blast from './blast.js';
import * as callers from './callers.js';
import * as phantoms from './phantoms.js';
import * as ranking from './ranking.js';

export type { RepoIntelDeps } from './deps.js';

export class RepoIntelService implements RepoIntel {
  constructor(private readonly d: RepoIntelDeps) {}

  // --- Indexing (indexing.ts) ----------------------------------------------

  /** Run a full index INLINE (no enqueue); the INDEX job handler delegates here. */
  async indexRepo(repoId: string): Promise<IndexResult> {
    return indexing.indexRepo(this.d, repoId);
  }

  /** Run an incremental refresh INLINE (falls back to a full index when stale). */
  async refreshIndex(repoId: string): Promise<IndexResult> {
    return indexing.refreshIndex(this.d, repoId);
  }

  /** Manual "re-analyze": sync the clone to origin/<default>, then refresh. Never throws. */
  async resyncRepo(repoId: string): Promise<IndexResult> {
    return indexing.resyncRepo(this.d, repoId);
  }

  /** Register the INDEX / REFRESH / RESYNC job handlers (one-shot at boot, index.ts). */
  registerIndexJobHandlers(): void {
    indexing.registerIndexJobHandlers(this.d.jobs, {
      indexRepo: (repoId) => this.indexRepo(repoId),
      refreshIndex: (repoId) => this.refreshIndex(repoId),
      resyncRepo: (repoId) => this.resyncRepo(repoId),
    });
  }

  /** ALWAYS works: the persisted state row, or a synthesised degraded one. */
  async getIndexState(repoId: string): Promise<IndexState> {
    return indexing.getIndexState(this.d, repoId);
  }

  // --- Reads ----------------------------------------------------------------

  async getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    return blast.getBlastRadius(this.d, repoId, changedFiles);
  }

  async getRepoMap(repoId: string, tokenBudget?: number): Promise<RepoMapResult> {
    return ranking.getRepoMap(this.d, repoId, tokenBudget);
  }

  async getFileRank(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    return ranking.getFileRank(this.d, repoId, paths);
  }

  async getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolRow[]> {
    return ranking.getSymbolsInFiles(this.d, repoId, paths);
  }

  async getCallerSignatures(
    repoId: string,
    changedFiles: string[],
    limit: number = MAX_CALLERS_PER_SYMBOL,
  ): Promise<SignatureRow[]> {
    return callers.getCallerSignatures(this.d, repoId, changedFiles, limit);
  }

  async getUnresolvedReferences(repoId: string, files: string[]): Promise<RefRow[]> {
    return phantoms.getUnresolvedReferences(this.d, repoId, files);
  }

  async getConventionSamples(repoId: string, n: number): Promise<string[]> {
    return this.getTopFilesByRank(repoId, n);
  }

  async getTopFilesByRank(
    repoId: string,
    n: number,
    opts?: { exclude?: string[] },
  ): Promise<string[]> {
    return ranking.getTopFilesByRank(this.d, repoId, n, opts);
  }

  async getCriticalPaths(repoId: string): Promise<string[][]> {
    return ranking.getCriticalPaths(this.d, repoId);
  }
}
