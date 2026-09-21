import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

// Shape mirrors `InjectionMatch` in the shared contracts (kept structural: db/ never imports contracts).
type InjectionMatchRow = { rule: string; severity: 'high' | 'medium'; line: number; excerpt: string };

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
  source: text('source', {
    enum: ['manual', 'imported_url', 'extracted', 'community'],
  }).notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  evidenceFiles: jsonb('evidence_files').$type<string[]>(),
  // Result of the deterministic injection scan run on every body write; a flagged
  // skill is force-disabled and cannot be enabled or linked to an agent.
  injectionDetected: boolean('injection_detected').notNull().default(false),
  injectionMatches: jsonb('injection_matches')
    .$type<InjectionMatchRow[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: now(),
});

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    // Set when this version was appended by restoring an older one.
    restoredFrom: integer('restored_from'),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
