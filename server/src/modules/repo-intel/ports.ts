import type { CodeIndex, GitClient } from '@devdigest/shared';
import type { FileRankRow, IndexResult, IndexState } from './types.js';

/**
 * repo-intel — what the `RepoIntelService` facade needs from the outside
 * world. `platform/container.ts` wires the real implementations: the Drizzle
 * repository, the indexing pipeline, the ast-grep / regex parsers and the
 * containment-checked file reader.
 */

// ---- shapes the store returns ----------------------------------------------

/** Minimal repo shape the facade needs to call CodeIndex on a clone. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Import-graph edge (importer → imported), repo-relative paths. */
export interface IndexerEdgeRow {
  fromFile: string;
  toFile: string;
}

/** Precomputed per-file facts (endpoints/crons) the indexer writes for blast. */
export interface IndexerFileFactsRow {
  filePath: string;
  endpoints: string[];
  crons: string[];
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

/** The read side of the index, plus the two lookups the facade starts from. */
export interface RepoIntelStore {
  getRepoBasics(repoId: string): Promise<RepoBasics | null>;
  tryGetIndexState(repoId: string): Promise<IndexState | null>;
  getSymbolRows(repoId: string, paths: string[]): Promise<FullSymbolRow[]>;
  getResolvedCallers(
    repoId: string,
    changedFiles: string[],
    symbolNames: string[],
  ): Promise<ResolvedCallerRow[]>;
  getFileFacts(repoId: string, files: string[]): Promise<IndexerFileFactsRow[]>;
  getRepoMapCache(
    repoId: string,
    sha: string,
    tokenBudget: number,
  ): Promise<{ mapText: string; tokenCount: number } | null>;
  getFileRankFor(repoId: string, paths: string[]): Promise<FileRankRow[]>;
  getRankedPaths(repoId: string, limit: number): Promise<Array<{ path: string; rank: number }>>;
  getEdges(repoId: string): Promise<IndexerEdgeRow[]>;
}

// ---- indexing ---------------------------------------------------------------

/** The indexing pipeline (`pipeline/`), run inline. */
export interface Indexer {
  runFull(repoId: string): Promise<IndexResult>;
  runIncremental(repoId: string): Promise<IndexResult>;
}

export interface IndexJobs {
  register(kind: string, handler: (payload: unknown) => Promise<void>): void;
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string }>;
}

// ---- source parsing (ast-grep + regex extractors) ---------------------------

export interface ParsedSymbol {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
  signature: string | null;
  endLine: number;
}

export interface ParsedImport {
  name: string;
  source: string;
  isType: boolean;
}

export interface ParsedInvocationHead {
  name: string;
  line: number;
  kind: 'call' | 'new' | 'jsx';
}

export interface SourceParser {
  /** Null when the file's extension is not a supported language. */
  langForFile(file: string): unknown | null;
  parseSymbols(file: string, source: string): ParsedSymbol[];
  parseImports(file: string, source: string): ParsedImport[];
  parseInvocationHeads(file: string, source: string): ParsedInvocationHead[];
  extractEndpoints(content: string): string[];
}

// ---- the clone --------------------------------------------------------------

/** Read a file from a clone, containment-checked; null when it cannot be read. */
export type CloneFileReader = (clonePath: string, file: string) => Promise<string | null>;

export type RepoSync = Pick<GitClient, 'sync'>;

export type SymbolIndex = Pick<CodeIndex, 'symbols' | 'references'>;
