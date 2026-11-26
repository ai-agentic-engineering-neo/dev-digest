import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, vector, index } from 'drizzle-orm/pg-core';
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

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  accepted: boolean('accepted').notNull().default(false),
  // Conventions Extractor (additive, nullable). `details` holds what the
  // flat columns cannot: up to 3 verified evidences with line ranges, the
  // category, a counter-example, the scan it came from and the skills it was
  // merged into (shape: ConventionDetails in modules/conventions/helpers.ts).
  // evidence_path / evidence_snippet keep mirroring evidence[0].
  details: jsonb('details'),
  // Set when the user rejects the rule; a re-scan never re-proposes it.
  // pending = !accepted && rejected_at IS NULL.
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
});
