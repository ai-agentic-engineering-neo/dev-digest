import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  integer,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now, enumCheck } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

// ============================================================ Knowledge / RAG

export const MEMORY_SCOPES = ['repo', 'global', 'team'] as const;
export const MEMORY_KINDS = ['decision', 'convention', 'preference', 'fact', 'learning'] as const;

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: MEMORY_SCOPES }).notNull(),
    kind: text('kind', { enum: MEMORY_KINDS }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    index('memory_ws_idx').on(t.workspaceId),
    index('memory_repo_idx').on(t.repoId),
    // ANN search (cosine) over memory embeddings — pgvector >= 0.5 (image ships 0.8).
    index('memory_embedding_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
    enumCheck('memory_scope_chk', t.scope, MEMORY_SCOPES),
    enumCheck('memory_kind_chk', t.kind, MEMORY_KINDS),
  ],
);

/** = ConventionCategory / ConventionStatus / ConventionScanStatus in @devdigest/shared. */
export const CONVENTION_CATEGORIES = [
  'naming',
  'structure',
  'error-handling',
  'async',
  'types',
  'imports',
  'testing',
  'api',
  'data-access',
  'style',
  'other',
] as const;
export const CONVENTION_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const CONVENTION_SCAN_STATUSES = ['running', 'done', 'failed'] as const;

/** Verified evidence of a convention (snippet = the real file lines). */
export interface ConventionEvidenceRow {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
}

/** A candidate the evidence gate / de-duplication dropped. */
export interface DroppedConventionRow {
  rule: string;
  path: string;
  reason: string;
}

/** One extraction run over a repo (server/specs/04-conventions.md). */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: CONVENTION_SCAN_STATUSES }).notNull().default('running'),
    sampledFiles: jsonb('sampled_files').$type<string[]>().notNull().default([]),
    proposed: integer('proposed').notNull().default(0),
    kept: integer('kept').notNull().default(0),
    dropped: jsonb('dropped').$type<DroppedConventionRow[]>().notNull().default([]),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('convention_scans_repo_started_idx').on(t.repoId, t.startedAt.desc()),
    // At most one running scan per repo (a second extract → 409 scan_running).
    uniqueIndex('convention_scans_one_running_uq').on(t.repoId).where(sql`${t.status} = 'running'`),
    enumCheck('convention_scans_status_chk', t.status, CONVENTION_SCAN_STATUSES),
  ],
);

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    category: text('category', { enum: CONVENTION_CATEGORIES }).notNull().default('other'),
    rule: text('rule').notNull(),
    evidence: jsonb('evidence').$type<ConventionEvidenceRow[]>().notNull().default([]),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: CONVENTION_STATUSES }).notNull().default('pending'),
    /** The user changed rule/category — survives a re-scan. */
    edited: boolean('edited').notNull().default(false),
    /** The skill this rule was last merged into. */
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('conventions_repo_idx').on(t.repoId),
    enumCheck('conventions_category_chk', t.category, CONVENTION_CATEGORIES),
    enumCheck('conventions_status_chk', t.status, CONVENTION_STATUSES),
  ],
);
