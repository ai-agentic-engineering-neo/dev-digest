import { z } from 'zod';

/**
 * Dependency graph / PR impact graph contracts (specs/18-dependency-graph.md).
 *
 * Owned by plan 19 task P1-A. Additive only: nothing here changes an existing
 * contract's required fields, so old `BlastRadius` payloads keep validating
 * (AC-34). The server and client copies of this file MUST stay byte-identical
 * (`test/dependency-graph-contract-parity.test.ts`).
 */

// ---- Index coverage & reindexing (AC-5, AC-15, AC-16a) ----

/** Resolution share for one binding class (value or type imports). */
export const IndexCoverageShare = z.object({
  resolved: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type IndexCoverageShare = z.infer<typeof IndexCoverageShare>;

export const UnresolvedReason = z.enum([
  'missing',
  'cycle',
  'ambiguous',
  'tsconfig',
  'non_literal',
  'outside_clone',
]);
export type UnresolvedReason = z.infer<typeof UnresolvedReason>;

/** One tsconfig that could not be read/parsed (resolution fell back to default). */
export const TsconfigFailure = z.object({
  path: z.string(),
  message: z.string(),
});
export type TsconfigFailure = z.infer<typeof TsconfigFailure>;

export const IndexCoverage = z.object({
  value: IndexCoverageShare,
  type: IndexCoverageShare,
  /** Count of unresolved specifiers by reason (`external`/`builtin` excluded, AC-5). */
  unresolvedBySpecifier: z.number().int().nonnegative(),
  unresolvedByReason: z.record(z.string(), z.number().int().nonnegative()).optional(),
  tsconfigFailures: z.array(TsconfigFailure),
  /** Share of symbol edges with `confidence: 'inferred'`, 0..1. */
  inferredShare: z.number().min(0).max(1),
});
export type IndexCoverage = z.infer<typeof IndexCoverage>;

/**
 * Re-index progress — a field SEPARATE from the index `status` enum (AC-16a),
 * also for the "queued" phase. Absent/null when no reindex is pending.
 */
export const IndexReindexing = z.object({
  state: z.enum(['queued', 'running']),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type IndexReindexing = z.infer<typeof IndexReindexing>;

/** Additive fields of the `GET /repos/:id/index-state` response. */
export const IndexStateGraphFields = z.object({
  coverage: IndexCoverage.nullish(),
  reindexing: IndexReindexing.nullish(),
});
export type IndexStateGraphFields = z.infer<typeof IndexStateGraphFields>;

// ---- Overlay (AC-25a…f) ----

export const OverlayInfo = z.object({
  /** `indexedSha !== pull_requests.base_sha`; also true when base_sha is NULL. */
  staleOverlay: z.boolean(),
  /** True when at least one changed file fell back to base-only data. */
  overlayDegraded: z.boolean(),
  /** First 50 degraded files; `degradedCount` carries the full number. */
  degradedFiles: z.array(z.string()),
  degradedCount: z.number().int().nonnegative(),
  baseSha: z.string().nullable(),
  headSha: z.string(),
  /** Persisted index SHA the overlay was applied on top of. */
  indexedSha: z.string().nullable(),
});
export type OverlayInfo = z.infer<typeof OverlayInfo>;

// ---- Blast graph (nodes / edges) ----

export const BlastNodeRole = z.enum(['changed', 'impacted', 'entry_point', 'test']);
export type BlastNodeRole = z.infer<typeof BlastNodeRole>;

export const BlastNodeKind = z.enum(['symbol', 'file']);
export type BlastNodeKind = z.infer<typeof BlastNodeKind>;

export const BlastEdgeKind = z.enum(['call', 'type', 'value', 'extends', 'implements', 're-export']);
export type BlastEdgeKind = z.infer<typeof BlastEdgeKind>;

export const BlastConfidence = z.enum(['exact', 'inferred']);
export type BlastConfidence = z.infer<typeof BlastConfidence>;

export const BlastGraphNode = z.object({
  /** Stable id: `<path>#<name>` for symbols, `<path>` for file nodes. */
  id: z.string(),
  kind: BlastNodeKind,
  name: z.string(),
  path: z.string(),
  role: BlastNodeRole,
  /** Hops from the nearest changed node; 0 for changed nodes. */
  depth: z.number().int().nonnegative(),
  /** Symbol kind (function/class/const/enum/module…), when `kind === 'symbol'`. */
  symbolKind: z.string().nullish(),
  rank: z.number().nullish(),
  /** Changed symbol/file removed by the PR (AC-26); rendered as deleted. */
  deleted: z.boolean().optional(),
  /** Reached only through type-only edges. */
  typeOnly: z.boolean().optional(),
  /** Entry-point label, e.g. `GET /users` or `cron 0 * * * *`. */
  entryLabel: z.string().nullish(),
  /**
   * 1-based declaration line at the PR head (AC-42 `file:line` link). Head
   * declarations for overlay-parsed files, the indexed line otherwise; absent
   * for deleted nodes (nothing to link to at head).
   */
  line: z.number().int().positive().optional(),
});
export type BlastGraphNode = z.infer<typeof BlastGraphNode>;

export const BlastGraphEdge = z.object({
  /** Dependent (caller/importer) node id. */
  from: z.string(),
  /** Depended-upon node id (towards the changed node). */
  to: z.string(),
  kind: BlastEdgeKind,
  confidence: BlastConfidence,
  /** Runtime vs type-only (AC-31). */
  typeOnly: z.boolean(),
  line: z.number().int().nullish(),
});
export type BlastGraphEdge = z.infer<typeof BlastGraphEdge>;

export const BlastTruncation = z.object({
  truncated: z.boolean(),
  nodesDropped: z.number().int().nonnegative(),
  edgesDropped: z.number().int().nonnegative(),
  /** Traversal visited-cap hit: all counts are lower bounds. */
  totalsCapped: z.boolean(),
  maxDepth: z.number().int().min(1).max(6),
  maxNodes: z.number().int().positive(),
  maxEdges: z.number().int().positive(),
});
export type BlastTruncation = z.infer<typeof BlastTruncation>;

// ---- Entry points & tests (AC-27a) ----

export const BlastEntryPoint = z.object({
  path: z.string(),
  /** `endpoint` / `cron` facts, or an app-router `page|route|layout` file. */
  type: z.enum(['endpoint', 'cron', 'page', 'route', 'layout']),
  label: z.string(),
  depth: z.number().int().nonnegative(),
});
export type BlastEntryPoint = z.infer<typeof BlastEntryPoint>;

export const BlastAffectedTest = z.object({
  path: z.string(),
  depth: z.number().int().nonnegative(),
});
export type BlastAffectedTest = z.infer<typeof BlastAffectedTest>;

/** Lists are capped (50 / 100); `*Total` carries the full count. */
export const BlastEntryPoints = z.object({
  items: z.array(BlastEntryPoint),
  total: z.number().int().nonnegative(),
});
export type BlastEntryPoints = z.infer<typeof BlastEntryPoints>;

export const BlastAffectedTests = z.object({
  items: z.array(BlastAffectedTest),
  total: z.number().int().nonnegative(),
});
export type BlastAffectedTests = z.infer<typeof BlastAffectedTests>;

// ---- Envelope graph payload ----

export const BlastGraph = z.object({
  nodes: z.array(BlastGraphNode),
  edges: z.array(BlastGraphEdge),
  truncation: BlastTruncation,
  entryPoints: BlastEntryPoints,
  tests: BlastAffectedTests,
});
export type BlastGraph = z.infer<typeof BlastGraph>;

/**
 * Index metadata attached to a blast response. `reindexing` set => the graph
 * is empty and no data/fallback is returned (AC-16a).
 */
export const BlastIndexInfo = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed']).nullable(),
  indexedSha: z.string().nullable(),
  lowConfidence: z.boolean(),
  coverage: IndexCoverage.nullish(),
  reindexing: IndexReindexing.nullish(),
});
export type BlastIndexInfo = z.infer<typeof BlastIndexInfo>;

/** Additive envelope fields next to the (unchanged) `BlastRadius` `data`. */
export const BlastGraphEnvelope = z.object({
  index: BlastIndexInfo,
  overlay: OverlayInfo,
  graph: BlastGraph,
});
export type BlastGraphEnvelope = z.infer<typeof BlastGraphEnvelope>;
