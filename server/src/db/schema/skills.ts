import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const skills = pgTable(
  'skills',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
  source: text('source', {
    enum: ['manual', 'imported_url', 'imported_file', 'extracted', 'community'],
  }).notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  evidenceFiles: jsonb('evidence_files').$type<string[]>(),
  createdAt: now(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Names are the human handle (`### Skill: <name>`) — unique per workspace so
  // seed/import stay idempotent and two blocks never share a header.
  (t) => ({ wsNameUq: uniqueIndex('skills_workspace_name_uq').on(t.workspaceId, t.name) }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    /** Short "what changed" note shown in the Versions tab (M2). */
    changeNote: text('change_note'),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
