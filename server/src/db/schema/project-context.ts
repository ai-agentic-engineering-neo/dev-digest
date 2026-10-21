import { pgTable, uuid, text, integer, primaryKey, index, timestamp } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';
import { agents } from './agents';

// ===================================== Project context attachments (SPEC-01)
// Ordered repo-relative document paths per (repo, agent|skill). Paths only,
// never document text: the text is read from git at run time.

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.repoId, t.path] }),
    byRepo: index('agent_context_docs_repo_idx').on(t.repoId),
  }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.repoId, t.path] }),
    byRepo: index('skill_context_docs_repo_idx').on(t.repoId),
  }),
);

// ===================================== Local overrides of repository documents
// The edited text of a document, kept in the DB only (never written to the
// clone or GitHub). Wins over the repository text for reads and runs while the
// path is listed. `sha` is the git blob of the repository version it was based on.

export const contextDocOverrides = pgTable(
  'context_doc_overrides',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    text: text('text').notNull(),
    sha: text('sha').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.path] }),
  }),
);
