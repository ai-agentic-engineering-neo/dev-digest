import { z } from 'zod';
import { IndexCoverage, IndexReindexing } from './dependency-graph.js';

/**
 * Project (whole-repo) dependency graph contracts (specs/18-dependency-graph.md,
 * plan 19 task P4-A). Server and client copies MUST stay byte-identical
 * (`test/dependency-graph-contract-parity.test.ts`).
 *
 * Every response is bounded (`MAX_GRAPH_NODES` / `MAX_GRAPH_EDGES`, page sizes)
 * and carries an explicit `state` so the UI never has to guess between
 * "no data", "reindexing" and "ready".
 */

export const MAX_GRAPH_NODES = 400;
export const MAX_GRAPH_EDGES = 1200;
export const MAX_SYMBOL_PAGE = 200;
export const DEFAULT_FILE_PAGE_SIZE = 100;
export const MAX_FILE_PAGE_SIZE = 500;
export const DEFAULT_UNRESOLVED_PAGE_SIZE = 50;
export const MAX_UNRESOLVED_PAGE_SIZE = 200;
export const MAX_CYCLES = 100;
export const MAX_CYCLE_MEMBERS = 50;
export const MAX_HOT_FILES = 20;

// ---- Index header (shared by every response) ----

export const ProjectGraphEmptyReason = z.enum(['never_indexed', 'indexing', 'failed']);
export type ProjectGraphEmptyReason = z.infer<typeof ProjectGraphEmptyReason>;

export const ProjectGraphIndex = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed']),
  indexedSha: z.string(),
  indexerVersion: z.number().int(),
  coverage: IndexCoverage.nullish(),
});
export type ProjectGraphIndex = z.infer<typeof ProjectGraphIndex>;

/** No index yet / in progress / failed: explicit reason, no data (AC-47). */
export const ProjectGraphEmpty = z.object({
  state: z.literal('empty'),
  reason: ProjectGraphEmptyReason,
});
export type ProjectGraphEmpty = z.infer<typeof ProjectGraphEmpty>;

/** Stored indexer version is stale or a reindex is running: progress, no data (AC-16a). */
export const ProjectGraphReindexing = z.object({
  state: z.literal('reindexing'),
  reindexing: IndexReindexing,
});
export type ProjectGraphReindexing = z.infer<typeof ProjectGraphReindexing>;

// ---- LoD graph ----

export const ProjectGraphNodeKind = z.enum(['directory', 'file', 'symbol']);
export type ProjectGraphNodeKind = z.infer<typeof ProjectGraphNodeKind>;

export const ProjectGraphNode = z.object({
  /** Stable id: directory path, file path, or `<path>#<name>` for symbols. */
  id: z.string(),
  kind: ProjectGraphNodeKind,
  label: z.string(),
  path: z.string(),
  /** Number of indexed files aggregated into a directory node (1 for files). */
  fileCount: z.number().int().nonnegative(),
  /** True for the single aggregate node standing in for a neighbour directory. */
  aggregate: z.boolean(),
  rank: z.number(),
  hot: z.boolean(),
  inCycle: z.boolean(),
  symbolKind: z.string().nullish(),
  exported: z.boolean().nullish(),
});
export type ProjectGraphNode = z.infer<typeof ProjectGraphNode>;

export const ProjectGraphEdge = z.object({
  from: z.string(),
  to: z.string(),
  /** Number of underlying file edges (file/directory graphs) or symbol edges. */
  weight: z.number().int().positive(),
  kind: z.string().nullish(),
  confidence: z.enum(['exact', 'inferred']).nullish(),
});
export type ProjectGraphEdge = z.infer<typeof ProjectGraphEdge>;

export const ProjectGraphTruncation = z.object({
  truncated: z.boolean(),
  nodesDropped: z.number().int().nonnegative(),
  edgesDropped: z.number().int().nonnegative(),
  maxNodes: z.number().int().positive(),
  maxEdges: z.number().int().positive(),
});
export type ProjectGraphTruncation = z.infer<typeof ProjectGraphTruncation>;

export const ProjectGraphCycle = z.object({
  size: z.number().int().positive(),
  /** First 50 members (sorted); `size` carries the full count. */
  members: z.array(z.string()),
  membersTruncated: z.boolean(),
});
export type ProjectGraphCycle = z.infer<typeof ProjectGraphCycle>;

export const ProjectGraphCycles = z.object({
  items: z.array(ProjectGraphCycle),
  /** Total SCCs of size > 1 (items is capped at 100). */
  total: z.number().int().nonnegative(),
  /** Files that belong to any cycle. */
  filesInCycles: z.number().int().nonnegative(),
});
export type ProjectGraphCycles = z.infer<typeof ProjectGraphCycles>;

export const ProjectGraphHotFile = z.object({
  path: z.string(),
  rank: z.number(),
  hotness: z.number(),
});
export type ProjectGraphHotFile = z.infer<typeof ProjectGraphHotFile>;

export const ProjectGraphFocus = z.object({
  mode: z.enum(['overview', 'dir', 'file']),
  /** Directory depth used for `overview`; null otherwise. */
  depth: z.number().int().nullable(),
  dir: z.string().nullable(),
  file: z.string().nullable(),
});
export type ProjectGraphFocus = z.infer<typeof ProjectGraphFocus>;

export const ProjectGraphReady = z.object({
  state: z.literal('ready'),
  index: ProjectGraphIndex,
  focus: ProjectGraphFocus,
  nodes: z.array(ProjectGraphNode),
  edges: z.array(ProjectGraphEdge),
  truncation: ProjectGraphTruncation,
  cycles: ProjectGraphCycles,
  hotFiles: z.array(ProjectGraphHotFile),
  /** File focus only: symbol paging (200 per page). */
  symbolPage: z
    .object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      total: z.number().int().nonnegative(),
    })
    .nullish(),
});
export type ProjectGraphReady = z.infer<typeof ProjectGraphReady>;

export const ProjectGraph = z.discriminatedUnion('state', [
  ProjectGraphEmpty,
  ProjectGraphReindexing,
  ProjectGraphReady,
]);
export type ProjectGraph = z.infer<typeof ProjectGraph>;

// ---- File table (non-visual equivalent) ----

export const ProjectGraphFileSort = z.enum(['path', 'rank', 'in', 'out', 'hotness']);
export type ProjectGraphFileSort = z.infer<typeof ProjectGraphFileSort>;

export const ProjectGraphFileRow = z.object({
  path: z.string(),
  inCount: z.number().int().nonnegative(),
  outCount: z.number().int().nonnegative(),
  rank: z.number(),
  hotness: z.number(),
  hot: z.boolean(),
  inCycle: z.boolean(),
});
export type ProjectGraphFileRow = z.infer<typeof ProjectGraphFileRow>;

export const ProjectGraphFilesReady = z.object({
  state: z.literal('ready'),
  index: ProjectGraphIndex,
  dir: z.string().nullable(),
  items: z.array(ProjectGraphFileRow),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type ProjectGraphFilesReady = z.infer<typeof ProjectGraphFilesReady>;

export const ProjectGraphFiles = z.discriminatedUnion('state', [
  ProjectGraphEmpty,
  ProjectGraphReindexing,
  ProjectGraphFilesReady,
]);
export type ProjectGraphFiles = z.infer<typeof ProjectGraphFiles>;

// ---- Unresolved specifiers (AC-50) ----

export const ProjectGraphUnresolvedItem = z.object({
  file: z.string(),
  specifier: z.string(),
  importedName: z.string(),
  line: z.number().int(),
  reason: z.string(),
});
export type ProjectGraphUnresolvedItem = z.infer<typeof ProjectGraphUnresolvedItem>;

export const ProjectGraphUnresolvedReady = z.object({
  state: z.literal('ready'),
  index: ProjectGraphIndex,
  items: z.array(ProjectGraphUnresolvedItem),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type ProjectGraphUnresolvedReady = z.infer<typeof ProjectGraphUnresolvedReady>;

export const ProjectGraphUnresolved = z.discriminatedUnion('state', [
  ProjectGraphEmpty,
  ProjectGraphReindexing,
  ProjectGraphUnresolvedReady,
]);
export type ProjectGraphUnresolved = z.infer<typeof ProjectGraphUnresolved>;

// ---- Symbols of one file ----

export const ProjectGraphSymbol = z.object({
  name: z.string(),
  kind: z.string(),
  line: z.number().int().nullable(),
  endLine: z.number().int().nullable(),
  exported: z.boolean(),
  inCount: z.number().int().nonnegative(),
  outCount: z.number().int().nonnegative(),
});
export type ProjectGraphSymbol = z.infer<typeof ProjectGraphSymbol>;

export const ProjectGraphSymbolsReady = z.object({
  state: z.literal('ready'),
  index: ProjectGraphIndex,
  file: z.string(),
  items: z.array(ProjectGraphSymbol),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type ProjectGraphSymbolsReady = z.infer<typeof ProjectGraphSymbolsReady>;

export const ProjectGraphSymbols = z.discriminatedUnion('state', [
  ProjectGraphEmpty,
  ProjectGraphReindexing,
  ProjectGraphSymbolsReady,
]);
export type ProjectGraphSymbols = z.infer<typeof ProjectGraphSymbols>;
