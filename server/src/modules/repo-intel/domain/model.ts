/**
 * repo-intel domain model — the row shapes the indexer produces and the read
 * models the facade consumes. Plain data: no Drizzle, no I/O. The repository
 * (infrastructure) maps these to/from tables; the use cases (application) and
 * the pure rules (domain) only ever see these types.
 */
import type { IndexStatus } from '../types.js';

/** Minimal repo shape the indexer/facade needs to work on a clone. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** One parsed symbol, buffered by the indexer before persistence. */
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

/** One parsed reference (call/usage), buffered before persistence. */
export interface IndexerReferenceRow {
  repoId: string;
  fromPath: string;
  toSymbol: string;
  line: number;
  contentHash: string;
}

/** Bundle of values the indexer persists into `repo_index_state`. */
export interface IndexStateUpsert {
  repoId: string;
  lastIndexedSha: string;
  indexerVersion: number;
  status: IndexStatus;
  filesIndexed: number;
  filesSkipped: number;
  stats: Record<string, unknown>;
}

/** Import-graph edge (importer → imported), repo-relative paths. */
export interface IndexerEdgeRow {
  fromFile: string;
  toFile: string;
}

/** One `file_rank` row the rank step produces. */
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

/** Full persisted symbol row — for getSymbolsInFiles + blast. */
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

/** What the file walk found: repo-relative paths + counters for `stats`. */
export interface WalkStats {
  /** Files seen on disk with a SUPPORTED_EXT extension (before size + bound filters). */
  totalCandidates: number;
  /** Candidates dropped because they exceed MAX_FILE_SIZE. */
  skippedTooLarge: number;
  /** Candidates dropped because the file list exceeded MAX_INDEXED_FILES. */
  bounded: number;
}

export interface WalkResult {
  /** Paths relative to the clone root, separator-normalized to forward slashes. */
  files: string[];
  stats: WalkStats;
}

/** A symbol as the source analyzer extracts it from one file. */
export interface SourceSymbol {
  name: string;
  kind: string;
  line: number;
  endLine: number;
  exported: boolean;
  signature: string | null;
}

/** A reference (usage of a name) as the source analyzer extracts it. */
export interface SourceReference {
  toSymbol: string;
  line: number;
}

/** A bare-identifier invocation head (`foo(`, `new Foo(`, `<Foo>`). */
export interface InvocationHead {
  name: string;
  line: number;
}

