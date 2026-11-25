/**
 * Row shapes shared by the repo-intel query modules and re-exported from
 * `../repository.ts` (the public surface consumers import from).
 */
import type { IndexStatus } from '../types.js';

/** Row shape the indexer pipeline buffers up before persistence. */
export interface IndexerSymbolRow {
  repoId: string;
  path: string;
  name: string;
  kind: string;
  line: number;
  endLine: number | null;
  exported: boolean;
  signature: string | null;
  contentHash: string;
}

export interface IndexerReferenceRow {
  repoId: string;
  fromPath: string;
  toSymbol: string;
  line: number;
  contentHash: string;
}

/** Bundle of values the pipeline persists into `repo_index_state`. */
export interface IndexStateUpsert {
  repoId: string;
  lastIndexedSha: string;
  indexerVersion: number;
  status: IndexStatus;
  filesIndexed: number;
  filesSkipped: number;
  stats: Record<string, unknown>;
}

/** Minimal repo shape the facade needs to call CodeIndex on a clone. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Cached row from the existing `symbols` table (blast persists these). */
export interface CachedSymbolRow {
  path: string;
  name: string;
  kind: string;
  line: number | null;
}

/** Cached row from the existing `references` table. */
export interface CachedReferenceRow {
  fromPath: string;
  toSymbol: string;
  line: number;
}

// --- T3 row shapes ----------------------------------------------------------

/** Import-graph edge (importer → imported), repo-relative paths. */
export interface IndexerEdgeRow {
  fromFile: string;
  toFile: string;
}

/** One `file_rank` row the rank step buffers before persistence. */
export interface IndexerFileRankRow {
  filePath: string;
  pagerank: number;
  hotness: number;
  rank: number;
  percentile: number;
}

/** Precomputed per-file facts (endpoints/crons) the indexer writes for blast. */
export interface IndexerFileFactsRow {
  filePath: string;
  endpoints: string[];
  crons: string[];
}

/** Candidate row for the repo-map renderer (symbols × file_rank). */
export interface RepoMapCandidateRow {
  path: string;
  name: string;
  exported: boolean;
  signature: string | null;
  rank: number;
}

/** Full symbol row (with the T2 columns) — for getSymbolsInFiles + blast. */
export interface FullSymbolRow {
  path: string;
  name: string;
  kind: string;
  line: number | null;
  endLine: number | null;
  exported: boolean;
  signature: string | null;
}

/** A resolved cross-file caller (reference whose decl_file is a changed file). */
export interface ResolvedCallerRow {
  fromPath: string;
  toSymbol: string;
  line: number;
  rank: number;
}
