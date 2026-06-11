/**
 * repo-intel — Tier 2 schema (plan §6.3).
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
 * forces a full reindex (plan §9.3).
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
// §9.5 DECISION (Option B, see docs/repo-intel-t3-spec.md §0): rank = pagerank,
// hotness is always 0 in v1 (the clone is shallow; no churn window). The
// `hotness` column stays so hotness can be switched on later WITHOUT a schema
// change — `rank` would then become `pagerank * (1 + hotness)`.

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
    hotness: doublePrecision('hotness').notNull(), // always 0 under Option B
    rank: doublePrecision('rank').notNull(), // = pagerank under Option B
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
 * prefix (plan §10.5). Invalidated by `runIncremental` when the SHA moves and by
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
