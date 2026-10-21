import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, vector, index, uniqueIndex, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One extraction run over a repo (HW2 conventions extractor). The latest scan
 * per repo is what the Conventions page shows; candidates point at their scan.
 */
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  provider: text('provider'),
  model: text('model'),
  sampleCount: integer('sample_count').notNull().default(0),
  candidatesFound: integer('candidates_found').notNull().default(0),
  candidatesKept: integer('candidates_kept').notNull().default(0),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => ({
  wsRepoStartedIdx: index('convention_scans_ws_repo_started_idx').on(t.workspaceId, t.repoId, t.startedAt),
  // One running scan per repo: a concurrent POST /extract hits 23505 and gets the existing scan back.
  oneRunningPerRepo: uniqueIndex('convention_scans_one_running_uidx')
    .on(t.repoId)
    .where(sql`${t.status} = 'running'`),
}));

/**
 * A convention candidate: `{category, rule, evidence file+line, confidence}` as
 * the model returned it, verified against the clone before it is stored.
 * `status` carries the user's decision; `rejected` survives a re-scan so a
 * dismissed rule does not come back.
 */
export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
  category: text('category').notNull().default('other'),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceLine: integer('evidence_line'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  status: text('status', { enum: ['candidate', 'accepted', 'rejected'] }).notNull().default('candidate'),
  // Legacy starter column, kept (drizzle-kit would otherwise ask whether the
  // new columns rename it, which needs a TTY). Mirrors `status === 'accepted'`.
  accepted: boolean('accepted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  wsRepoIdx: index('conventions_ws_repo_idx').on(t.workspaceId, t.repoId),
  scanIdx: index('conventions_scan_idx').on(t.scanId),
}));
