import { pgTable, uuid, text, integer, jsonb, doublePrecision, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Conventions

/**
 * A house-rule candidate proposed by the conventions scan. Every citation
 * (`evidence_*`) is verified by code against the checked-out file before the
 * row is written. `status` is the triage decision; the three states are
 * distinct on purpose: a re-scan replaces only `pending` rows, so a rejected
 * rule stays rejected instead of coming back every scan.
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
    /** Why the rule exists / what a reviewer should flag: model-written, editable. */
    rationale: text('rationale'),
    evidencePath: text('evidence_path'),
    /** 1-based line of `evidence_snippet` in `evidence_path`, as verified by code. */
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    /** Sampled files that contain the snippet (primary first): code-verified support. */
    evidenceFiles: jsonb('evidence_files').$type<string[]>().notNull().default([]),
    /** `evidenceFiles.length` at scan time: the "seen in N files" chip. */
    occurrences: integer('occurrences').notNull().default(1),
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
    // `text({ enum })` narrows TypeScript only and emits no DB constraint:
    // these mirror the ConventionStatus / ConventionCategory contract enums.
    statusCk: check('conventions_status_ck', sql`${t.status} in ('pending', 'accepted', 'rejected')`),
    categoryCk: check(
      'conventions_category_ck',
      sql`${t.category} in ('naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general')`,
    ),
  }),
);
