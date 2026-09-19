import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
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
    // 'imported_file' — a skill body derived from an uploaded .md/.zip (§3 of
    // specs/02-skills.md). Distinct from 'imported_url', which this lesson does
    // not implement.
    source: text('source', {
      enum: ['manual', 'imported_url', 'imported_file', 'extracted', 'community'],
    }).notNull(),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
  },
  (t) => ({
    // D3 — a skill name is a slug, unique per workspace (also makes the seed
    // idempotent by name).
    workspaceNameUnique: uniqueIndex('skills_workspace_name_unique').on(t.workspaceId, t.name),
    workspaceIdx: index('skills_workspace_idx').on(t.workspaceId),
  }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    // Author's optional note on what changed in this version (≤200 chars),
    // shown on the Versions tab. Null when left blank.
    message: text('message'),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
