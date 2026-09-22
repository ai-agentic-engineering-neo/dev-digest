/**
 * repo-intel ports — what the use cases need from the outside world. The
 * infrastructure ring implements them (RepoIntelRepository, the ast-grep
 * source analyzer, the clone file system, the dependency-cruiser graph) and the
 * module's composition.ts wires the real ones; tests pass in-memory fakes.
 */
import type { CodeIndex, GitClient } from '@devdigest/shared';
import type { TransactionRunner } from '../../../application/transaction.js';
import type {
  FullSymbolRow,
  IndexStateUpsert,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  IndexerFileRankRow,
  IndexerReferenceRow,
  IndexerSymbolRow,
  InvocationHead,
  RepoBasics,
  RepoMapCandidateRow,
  ResolvedCallerRow,
  SourceReference,
  SourceSymbol,
  WalkResult,
} from '../domain/model.js';
import type { TokenCounter } from '../domain/repo-map.js';
import type { FileRankRow, IndexState } from '../types.js';

/** Reads of the persisted index (outside any transaction). */
export interface RepoIntelReader {
  getRepoBasics(repoId: string): Promise<RepoBasics | null>;
  /** `null` when no row exists (or the table is missing) — never throws. */
  tryGetIndexState(repoId: string): Promise<IndexState | null>;
  getSymbolRows(repoId: string, paths: string[]): Promise<FullSymbolRow[]>;
  getResolvedCallers(repoId: string, declFiles: string[], names: string[]): Promise<ResolvedCallerRow[]>;
  getFileFacts(repoId: string, files: string[]): Promise<IndexerFileFactsRow[]>;
  getFileRankFor(repoId: string, paths: string[]): Promise<FileRankRow[]>;
  getRankedPaths(repoId: string, limit: number): Promise<Array<{ path: string; rank: number }>>;
  getEdges(repoId: string): Promise<IndexerEdgeRow[]>;
  getRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
  ): Promise<{ mapText: string; tokenCount: number } | null>;
}

/** Single-statement `repo_index_state` writes the indexer makes outside a reindex transaction. */
export interface IndexStateWriter {
  upsertIndexState(state: IndexStateUpsert): Promise<void>;
  touchIndexState(repoId: string): Promise<void>;
  advanceSha(repoId: string, sha: string): Promise<void>;
}

/** Writes of ONE (re)index, bound to its transaction. */
export interface IndexWriter {
  deleteAllForRepo(repoId: string): Promise<void>;
  deleteForFiles(repoId: string, paths: string[]): Promise<void>;
  insertSymbols(rows: IndexerSymbolRow[]): Promise<void>;
  insertReferences(rows: IndexerReferenceRow[]): Promise<void>;
  replaceEdges(repoId: string, edges: IndexerEdgeRow[]): Promise<void>;
  resolveReferences(repoId: string, opts: { reset: boolean }): Promise<void>;
  replaceFileRank(repoId: string, rows: IndexerFileRankRow[]): Promise<void>;
  replaceFileFacts(repoId: string, rows: IndexerFileFactsRow[]): Promise<void>;
  patchFileFacts(repoId: string, files: string[], rows: IndexerFileFactsRow[]): Promise<void>;
  getRepoMapCandidates(repoId: string): Promise<RepoMapCandidateRow[]>;
  deleteRepoMapCache(repoId: string): Promise<void>;
  putRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
    mapText: string,
    tokenCount: number,
  ): Promise<void>;
  upsertIndexState(state: IndexStateUpsert): Promise<void>;
  /** Run `work` in a SAVEPOINT: a throw rolls back only that step. */
  savepoint<T>(work: (writer: IndexWriter) => Promise<T>): Promise<T>;
}

/** Transaction boundary of a reindex: `work` gets the tx-bound writer. */
export type IndexTransaction = TransactionRunner<{ index: IndexWriter }>;

/** Parses source text (ast-grep in production). Pure given its input; may throw on a binding error. */
export interface SourceAnalyzer {
  /** True when the file's extension is one the parser understands. */
  supports(file: string): boolean;
  symbols(file: string, source: string): SourceSymbol[];
  references(file: string, source: string): SourceReference[];
  /** Local names bound by the file's imports. */
  importedNames(file: string, source: string): string[];
  invocationHeads(file: string, source: string): InvocationHead[];
  /** "METHOD /path" route declarations found in the source. */
  endpoints(source: string): string[];
  crons(source: string): string[];
}

/** Read access to a repo's clone on disk. */
export interface CloneFiles {
  /** Source files to index under `root` (filtered + bounded) + walk stats. */
  walk(root: string): Promise<WalkResult>;
  /** UTF-8 content of `relPath` under `root`; throws when unreadable or outside the root. */
  read(root: string, relPath: string): Promise<string>;
}

/** Local import edges among `files` under `root` (never throws; `[]` on failure). */
export interface ImportGraph {
  buildEdges(root: string, files: string[]): Promise<Array<{ from: string; to: string }>>;
}

/** The git operations the indexer uses on a clone. */
export type RepoGit = Pick<GitClient, 'currentHead' | 'diffNameOnly' | 'sync'>;

/** Background-job queue (enqueue only). */
export interface JobQueue {
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string }>;
}

/** Everything the indexer use cases need. */
export interface IndexerDeps {
  reader: Pick<RepoIntelReader, 'getRepoBasics' | 'tryGetIndexState'>;
  state: IndexStateWriter;
  tx: IndexTransaction;
  git: RepoGit;
  analyzer: SourceAnalyzer;
  files: CloneFiles;
  graph: ImportGraph;
  tokenizer: TokenCounter;
  /** How many files are read + parsed at once during a full index. */
  parseConcurrency: number;
}

/** Everything the read facade needs. */
export interface QueryDeps {
  /** Global REPO_INTEL_ENABLED flag. */
  enabled: boolean;
  reader: RepoIntelReader;
  codeIndex: CodeIndex;
  analyzer: SourceAnalyzer;
  files: CloneFiles;
}

export type RepoIntelDeps = IndexerDeps & QueryDeps & { jobs: JobQueue };
