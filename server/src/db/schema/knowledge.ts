import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  vector,
  index,
} from 'drizzle-orm/pg-core';
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

// One row per extraction run — groups the candidates it produced and records
// what was sampled and against which commit, for "detected from N files ·
// last scan" and for evidence links that stay pinned to a real sha.
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  sampleFileCount: integer('sample_file_count').notNull(),
  sourceSha: text('source_sha').notNull(),
  model: text('model').notNull(),
  createdAt: now(),
});

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'cascade' }),
  category: text('category').notNull().default('other'),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceStartLine: integer('evidence_start_line'),
  evidenceEndLine: integer('evidence_end_line'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  // Extracted candidates start 'pending'; a human accept/rejects each one.
  // Only 'accepted' rows may be merged into a skill (enforced server-side).
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
});
