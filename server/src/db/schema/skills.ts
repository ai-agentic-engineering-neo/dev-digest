import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { now, enumCheck } from './_shared';
import { workspaces } from './core';

export const SKILL_TYPES = ['rubric', 'convention', 'security', 'custom'] as const;
export const SKILL_SOURCES = ['manual', 'imported_url', 'extracted', 'community'] as const;

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: SKILL_TYPES }).notNull(),
    source: text('source', { enum: SKILL_SOURCES }).notNull(),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
  },
  (t) => [
    enumCheck('skills_type_chk', t.type, SKILL_TYPES),
    enumCheck('skills_source_chk', t.source, SKILL_SOURCES),
  ],
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
