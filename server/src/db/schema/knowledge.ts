import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, vector, index } from 'drizzle-orm/pg-core';
import { now, enumCheck } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

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

export const conventions = pgTable(
  'conventions',
  {
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
  },
  (t) => [index('conventions_repo_idx').on(t.repoId)],
);
