import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, unique, check, timestamp } from 'drizzle-orm/pg-core';
import { now, enumCheck } from './_shared';
import { workspaces } from './core';

export const SKILL_TYPES = ['rubric', 'convention', 'security', 'custom'] as const;
/** = SkillSource in @devdigest/shared. `imported_file` = a .md / .zip upload. */
export const SKILL_SOURCES = ['manual', 'imported_file', 'imported_url', 'extracted', 'community'] as const;

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
    /** Provenance of a non-manual skill: file name, URL or `community:<id>`. */
    sourceRef: text('source_ref'),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Name is the skill's handle in the prompt (`### <name>`) and in finding
    // attribution, so it is unique per workspace (23505 → 409 conflict).
    unique('skills_ws_name_uq').on(t.workspaceId, t.name),
    check('skills_name_len_chk', sql`length(${t.name}) BETWEEN 1 AND 64`),
    enumCheck('skills_type_chk', t.type, SKILL_TYPES),
    enumCheck('skills_source_chk', t.source, SKILL_SOURCES),
  ],
);

/** Immutable snapshot of a skill's model-facing text (body + description). */
export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    description: text('description'),
    /** Auto-generated: Created · Edited body · Restored from vK · Imported from <ref> … */
    message: text('message'),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
