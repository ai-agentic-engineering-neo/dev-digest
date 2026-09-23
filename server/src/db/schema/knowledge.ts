import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, vector, index } from 'drizzle-orm/pg-core';
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
 * Convention candidates extracted from a repo (the Conventions Extractor).
 *
 * A row is a PROPOSAL, not a fact: the model writes it, code verifies its
 * evidence against the checked-out file (see modules/conventions/helpers.ts),
 * and the user accepts or rejects it. `status` is that decision — three
 * states, not a boolean, because a re-scan replaces only `pending` rows: an
 * accepted or rejected rule is never re-litigated by the next scan.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    /** Grouping shown on the card and used as the skill's section heading. */
    category: text('category', {
      enum: ['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'],
    })
      .notNull()
      .default('general'),
    rule: text('rule').notNull(),
    /** Why the rule exists / what a reviewer should flag — model-written, editable. */
    rationale: text('rationale'),
    evidencePath: text('evidence_path'),
    /** 1-based line of `evidence_snippet` in `evidence_path`, as verified by code. */
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
  },
  (t) => ({
    // Every read is "this repo's candidates, newest first"; Postgres does not
    // index foreign keys automatically.
    repoCreatedIdx: index('conventions_repo_created_idx').on(t.repoId, t.createdAt.desc()),
  }),
);
