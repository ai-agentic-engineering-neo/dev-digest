import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

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
 * One extraction run over a repo's clone. Scan-level facts live here rather
 * than repeated on every candidate: which files the model actually saw, which
 * model answered, and how much of its answer was thrown away by the verifier.
 *
 * At most one `running` row per repo — enforced by a partial unique index in
 * the migration, not by a read-then-write in the service.
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['running', 'done', 'failed'] })
      .notNull()
      .default('running'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** Clone HEAD at scan time — what evidence deep-links are pinned to. */
    headSha: text('head_sha'),
    sampleFiles: jsonb('sample_files').$type<string[]>().notNull().default([]),
    candidatesTotal: integer('candidates_total').notNull().default(0),
    candidatesKept: integer('candidates_kept').notNull().default(0),
    discarded: jsonb('discarded').notNull().default({}),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    repoIdx: index('convention_scans_repo_idx').on(t.repoId, t.startedAt),
    // At most one scan in flight per repo. A partial unique index rather than a
    // read-then-insert in the service: two clicks on "Run scan" land in the same
    // millisecond often enough, and only the database can actually refuse one.
    oneRunning: uniqueIndex('convention_scans_one_running_idx')
      .on(t.repoId)
      .where(sql`status = 'running'`),
  }),
);

/**
 * A house rule proposed by a scan and verified against the clone.
 *
 * `status` replaces the original `accepted boolean`: a rejected rule has to
 * survive both a reload and a re-scan, and a boolean cannot distinguish "not
 * looked at yet" from "looked at and refused". `evidenceSnippet` is read from
 * the file rather than copied from the model's answer.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    /**
     * The model's one-sentence case for the rule — where it quotes the counts
     * from the measured facts ("kebab-case in 143 of 152 files"). The snippet
     * shows ONE occurrence; this is what says how widespread the pattern is.
     */
    rationale: text('rationale'),
    category: text('category', {
      enum: [
        'naming',
        'structure',
        'imports',
        'types',
        'async',
        'error-handling',
        'api',
        'testing',
        'logging',
        'other',
      ],
    })
      .notNull()
      .default('other'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    evidencePath: text('evidence_path'),
    evidenceLineStart: integer('evidence_line_start'),
    evidenceLineEnd: integer('evidence_line_end'),
    evidenceSnippet: text('evidence_snippet'),
    evidenceSha: text('evidence_sha'),
    confidence: doublePrecision('confidence'),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    /** Set once the candidate is folded into a skill; drives the card's badge. */
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status) }),
);
