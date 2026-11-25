/**
 * repo-intel repository — thin Drizzle data access over `symbols`,
 * `references`, `file_edges`, `file_rank`, `file_facts`, `repo_map_cache` and
 * `repo_index_state` (db/schema/context.ts).
 *
 * The query implementations are colocated, split by the tables they touch,
 * under `./repository/` (index-state, symbols, references, graph-rank,
 * file-facts, repo-map). This class composes them so its public API stays
 * identical; the row types live in `./repository/types.ts` and are re-exported
 * here.
 *
 * IMPORTANT: `tryGetIndexState` MUST swallow errors (e.g. `undefined_table`,
 * Postgres 42P01) so the facade keeps returning degraded — never throws.
 */
import type { Db } from '../../db/client.js';
import type { FileRankRow, IndexState } from './types.js';
import type {
  CachedReferenceRow,
  CachedSymbolRow,
  FullSymbolRow,
  IndexStateUpsert,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  IndexerFileRankRow,
  IndexerReferenceRow,
  IndexerSymbolRow,
  RepoBasics,
  RepoMapCandidateRow,
  ResolvedCallerRow,
} from './repository/types.js';
import * as indexState from './repository/index-state.js';
import * as symbols from './repository/symbols.js';
import * as references from './repository/references.js';
import * as graphRank from './repository/graph-rank.js';
import * as fileFacts from './repository/file-facts.js';
import * as repoMap from './repository/repo-map.js';

export type * from './repository/types.js';

export class RepoIntelRepository {
  constructor(private db: Db) {}

  // ---- repo basics + repo_index_state -------------------------------------

  getRepoBasics(repoId: string): Promise<RepoBasics | null> {
    return indexState.getRepoBasics(this.db, repoId);
  }
  tryGetIndexState(repoId: string): Promise<IndexState | null> {
    return indexState.tryGetIndexState(this.db, repoId);
  }
  upsertIndexState(state: IndexStateUpsert): Promise<void> {
    return indexState.upsertIndexState(this.db, state);
  }
  touchIndexState(repoId: string, stats?: Record<string, unknown>): Promise<void> {
    return indexState.touchIndexState(this.db, repoId, stats);
  }
  advanceSha(repoId: string, sha: string): Promise<void> {
    return indexState.advanceSha(this.db, repoId, sha);
  }

  // ---- symbols ------------------------------------------------------------

  getCachedSymbols(repoId: string): Promise<CachedSymbolRow[]> {
    return symbols.getCachedSymbols(this.db, repoId);
  }
  getCachedSymbolsForFiles(repoId: string, paths: string[]): Promise<CachedSymbolRow[]> {
    return symbols.getCachedSymbolsForFiles(this.db, repoId, paths);
  }
  getSymbolRows(repoId: string, paths: string[]): Promise<FullSymbolRow[]> {
    return symbols.getSymbolRows(this.db, repoId, paths);
  }
  insertSymbols(rows: IndexerSymbolRow[]): Promise<void> {
    return symbols.insertSymbols(this.db, rows);
  }
  deleteAllForRepo(repoId: string): Promise<void> {
    return symbols.deleteAllForRepo(this.db, repoId);
  }
  deleteForFiles(repoId: string, paths: string[]): Promise<void> {
    return symbols.deleteForFiles(this.db, repoId, paths);
  }

  // ---- references ---------------------------------------------------------

  getCachedReferencesTo(repoId: string, toSymbols: string[]): Promise<CachedReferenceRow[]> {
    return references.getCachedReferencesTo(this.db, repoId, toSymbols);
  }
  getResolvedCallers(
    repoId: string,
    declFiles: string[],
    names: string[],
  ): Promise<ResolvedCallerRow[]> {
    return references.getResolvedCallers(this.db, repoId, declFiles, names);
  }
  insertReferences(rows: IndexerReferenceRow[]): Promise<void> {
    return references.insertReferences(this.db, rows);
  }
  resolveReferences(repoId: string, opts: { reset: boolean }): Promise<void> {
    return references.resolveReferences(this.db, repoId, opts);
  }

  // ---- import graph + file rank -------------------------------------------

  replaceEdges(repoId: string, edges: IndexerEdgeRow[]): Promise<void> {
    return graphRank.replaceEdges(this.db, repoId, edges);
  }
  getEdges(repoId: string): Promise<IndexerEdgeRow[]> {
    return graphRank.getEdges(this.db, repoId);
  }
  replaceFileRank(repoId: string, rows: IndexerFileRankRow[]): Promise<void> {
    return graphRank.replaceFileRank(this.db, repoId, rows);
  }
  getFileRankFor(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    return graphRank.getFileRankFor(this.db, repoId, paths);
  }
  getRankedPaths(repoId: string, limit: number): Promise<Array<{ path: string; rank: number }>> {
    return graphRank.getRankedPaths(this.db, repoId, limit);
  }

  // ---- file facts ---------------------------------------------------------

  replaceFileFacts(repoId: string, rows: IndexerFileFactsRow[]): Promise<void> {
    return fileFacts.replaceFileFacts(this.db, repoId, rows);
  }
  patchFileFacts(repoId: string, files: string[], rows: IndexerFileFactsRow[]): Promise<void> {
    return fileFacts.patchFileFacts(this.db, repoId, files, rows);
  }
  getFileFacts(repoId: string, files: string[]): Promise<IndexerFileFactsRow[]> {
    return fileFacts.getFileFacts(this.db, repoId, files);
  }

  // ---- repo map -----------------------------------------------------------

  getRepoMapCandidates(repoId: string): Promise<RepoMapCandidateRow[]> {
    return repoMap.getRepoMapCandidates(this.db, repoId);
  }
  getRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
  ): Promise<{ mapText: string; tokenCount: number } | null> {
    return repoMap.getRepoMapCache(this.db, repoId, commitSha, tokenBudget);
  }
  putRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
    mapText: string,
    tokenCount: number,
  ): Promise<void> {
    return repoMap.putRepoMapCache(this.db, repoId, commitSha, tokenBudget, mapText, tokenCount);
  }
  deleteRepoMapCache(repoId: string): Promise<void> {
    return repoMap.deleteRepoMapCache(this.db, repoId);
  }
}
