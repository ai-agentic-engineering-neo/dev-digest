/**
 * repo-intel — Tier 2 schema.
 *
 * This file holds ONLY the T2 tables:
 *   - repoIndexState — 1:1 per repo, drives the facade's getIndexState.
 *   - fileEdges      — import graph edges (for blast / phantom resolution).
 *   - fileFacts      — precomputed per-file facts (endpoints/crons), so blast
 *                      doesn't have to re-parse the clone on every request.
 *
 * T3 tables (`file_rank`, `repo_map_cache`) land in a later slice — they
 * depend on the graph + token-budget work and should ship as their own
 * migration so T2's pipeline can release independently.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  doublePrecision,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { repos } from './repos';

/**
 * Per-repo index status, 1:1 with repos. PK = repoId (no surrogate id — there
 * is exactly one row per repo, kept current by the indexer worker).
 *
 * `indexerVersion` is compared against constants.INDEXER_VERSION; a mismatch
 * forces a full reindex.
 */
export const repoIndexState = pgTable('repo_index_state', {
  repoId: uuid('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  lastIndexedSha: text('last_indexed_sha').notNull(),
  indexerVersion: integer('indexer_version').notNull(),
  status: text('status', {
    enum: ['full', 'partial', 'degraded', 'failed'],
  }).notNull(),
  filesIndexed: integer('files_indexed').notNull().default(0),
  filesSkipped: integer('files_skipped').notNull().default(0),
  stats: jsonb('stats').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  // specs/18 — index coverage + reindex progress. All nullable: rows written
  // before indexer v3 carry NULL. `reindex_*` is a SEPARATE axis from `status`
  // (AC-16a) — nothing is added to the status enum.
  coverage: jsonb('coverage'),
  reindexState: text('reindex_state', { enum: ['queued', 'running'] }),
  reindexDone: integer('reindex_done'),
  reindexTotal: integer('reindex_total'),
  tsconfigFailures: jsonb('tsconfig_failures'),
});

/**
 * Import-graph edges: `fromFile` imports `toFile`. Composite PK keeps inserts
 * idempotent; the reverse-lookup index (`repoId, toFile`) is what blast uses
 * to walk "who depends on this file?" in O(degree).
 */
export const fileEdges = pgTable(
  'file_edges',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    fromFile: text('from_file').notNull(),
    toFile: text('to_file').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.fromFile, t.toFile] }),
    toIdx: index('file_edges_repo_to_idx').on(t.repoId, t.toFile),
  }),
);

/**
 * Import bindings (specs/18): one row per local binding of an import
 * statement. `resolvedFile` is NULL when unresolved; `unresolvedReason` says
 * why (`external`/`builtin` are NOT counted as unresolved). Derived
 * `file_edges` are written only from rows with a non-null `resolvedFile`.
 */
export const fileImports = pgTable(
  'file_imports',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    fromFile: text('from_file').notNull(),
    idx: integer('idx').notNull(),
    localName: text('local_name').notNull(),
    importedName: text('imported_name').notNull(),
    specifier: text('specifier').notNull(),
    isType: boolean('is_type').notNull().default(false),
    kind: text('kind', { enum: ['static', 'dynamic', 'require'] }).notNull(),
    line: integer('line').notNull(),
    resolvedFile: text('resolved_file'),
    unresolvedReason: text('unresolved_reason', {
      enum: [
        'missing',
        'cycle',
        'ambiguous',
        'tsconfig',
        'non_literal',
        'outside_clone',
        'external',
        'builtin',
      ],
    }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.fromFile, t.idx] }),
    resolvedIdx: index('file_imports_repo_resolved_idx').on(t.repoId, t.resolvedFile),
    fromIdx: index('file_imports_repo_from_idx').on(t.repoId, t.fromFile),
  }),
);

/** Export table (specs/18): what each file exports, incl. re-export chains. */
export const fileExports = pgTable(
  'file_exports',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    exportedName: text('exported_name').notNull(),
    localName: text('local_name'),
    kind: text('kind', {
      enum: ['local', 'default', 'reexport', 'reexport_all', 'namespace'],
    }).notNull(),
    specifier: text('specifier'),
    resolvedFile: text('resolved_file'),
    line: integer('line').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.file, t.exportedName, t.kind] }),
    resolvedIdx: index('file_exports_repo_resolved_idx').on(t.repoId, t.resolvedFile),
  }),
);

/**
 * Symbol-level edges (specs/18): `from` symbol references `to` symbol.
 * Module-scope pseudo-symbol name = `<module>`.
 */
export const symbolEdges = pgTable(
  'symbol_edges',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    fromPath: text('from_path').notNull(),
    fromName: text('from_name').notNull(),
    toPath: text('to_path').notNull(),
    toName: text('to_name').notNull(),
    kind: text('kind', {
      enum: ['call', 'type', 'value', 'extends', 'implements', 're-export'],
    }).notNull(),
    confidence: text('confidence', { enum: ['exact', 'inferred'] }).notNull(),
    line: integer('line').notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.repoId, t.fromPath, t.fromName, t.toPath, t.toName, t.kind, t.line],
    }),
    toIdx: index('symbol_edges_repo_to_idx').on(t.repoId, t.toPath, t.toName),
    fromIdx: index('symbol_edges_repo_from_idx').on(t.repoId, t.fromPath),
  }),
);

/**
 * Per-file precomputed facts (HTTP endpoints, cron/job schedules) so the
 * blast service doesn't have to re-parse the clone on every request. Written
 * by the indexer alongside symbols/references. Composite PK = (repoId, filePath).
 */
export const fileFacts = pgTable(
  'file_facts',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    endpoints: jsonb('endpoints').notNull().default([]),
    crons: jsonb('crons').notNull().default([]),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.filePath] }),
  }),
);

// ------------------------------------------------------------------- T3 -----
//
// `file_rank` and `repo_map_cache` land in their own migration (0005) — they
// depend on the dependency-cruiser graph + PageRank + token-budget work.
//
// `hotness` is real and persisted (specs/10-onboarding-generator.md, D6):
// derived from already-ingested PR-file history within a recency window,
// normalized to [0, 1] per repo, 0 when there's no such history. `rank` stays
// `= pagerank` deliberately (D7) — three already-shipped features read it
// (repo-map rendering, blast-radius caller ordering, conventions sampling),
// so this column is NOT redefined as `pagerank * (1 + hotness)`. That weighted
// product is derived at READ TIME, by the onboarding module only, from the
// `pagerank`/`hotness` values below — never written back to this table.

/**
 * Per-file importance rank. PK = (repoId, filePath). Written by pipeline/rank.ts
 * on every full index and recomputed on every incremental refresh (cheap on
 * ≤ MAX_INDEXED_FILES nodes).
 */
export const fileRank = pgTable(
  'file_rank',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    pagerank: doublePrecision('pagerank').notNull(),
    hotness: doublePrecision('hotness').notNull(), // real churn signal (D6); 0 with no PR history in-window
    rank: doublePrecision('rank').notNull(), // deliberately = pagerank always (D7) — see the T3 header comment above
    percentile: smallint('percentile').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.filePath] }),
    rankIdx: index('file_rank_repo_rank_idx').on(t.repoId, t.rank),
  }),
);

/**
 * Rendered repo-map cache, keyed by (repoId, commitSha, tokenBudget). The map
 * text is deterministic per HEAD + budget, which keeps it a stable prompt-cache
 * prefix. Invalidated by `runIncremental` when the SHA moves and by
 * the `ON DELETE CASCADE` when the repo is removed.
 */
export const repoMapCache = pgTable(
  'repo_map_cache',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    commitSha: text('commit_sha').notNull(),
    tokenBudget: integer('token_budget').notNull(),
    mapText: text('map_text').notNull(),
    tokenCount: integer('token_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.commitSha, t.tokenBudget] }),
  }),
);
