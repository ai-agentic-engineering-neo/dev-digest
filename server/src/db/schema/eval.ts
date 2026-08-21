import { sql, desc } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import type { EvalExpectation, EvalCaseOutcome } from '@devdigest/shared';

// ============================================================ Eval / Conformance / Compose
//
// specs/12-eval-pipeline.md (L06) — `eval_cases` / `eval_runs` reshaped in
// place (D1). Both tables were confirmed at zero rows before this migration
// (server/LEARNINGS.md's "reserved-but-unwired" pattern), so `NOT NULL`
// without a default is safe here.

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    // D8/D16 — the frozen, self-contained diff fragment (this file's hunks
    // only), never a live pointer.
    inputDiff: text('input_diff').notNull(),
    inputFiles: jsonb('input_files').$type<string[]>().notNull(),
    // D16's trimmed PR metadata: { pr_number, title, body }.
    inputMeta: jsonb('input_meta').notNull(),
    // Reserved column name kept as-is (renaming would be a drop+add on a
    // table that also gains columns — finding 4's two-pass trap). The DTO
    // field is `expectation`; this column holds that same object (D3).
    expectedOutput: jsonb('expected_output').$type<EvalExpectation>().notNull(),
    notes: text('notes'),
    // The finding this case was created from — no FK (D8: a case outlives
    // its finding, review, PR and repo). Null for a hand-authored/fixture
    // case; the unique index below only applies to non-null values
    // (Postgres allows many NULLs through a unique index).
    sourceFindingId: uuid('source_finding_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // D17/AC-1 — idempotency enforced in the database: re-activating the
    // turn-into-eval-case action on the same finding can never create a
    // second row.
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId),
    ownerIdx: index('eval_cases_owner_idx').on(t.workspaceId, t.ownerKind, t.ownerId),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    // `ranAt` (pre-existing) is reused as the run's START time.
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    status: text('status', { enum: ['running', 'completed', 'errored'] })
      .notNull()
      .default('running'),
    // D4 — the agent configuration version this run executed against.
    agentVersion: integer('agent_version'),
    // D5 — the exact set of case ids this run covered (apples-to-apples
    // comparison, AC-33).
    caseIds: jsonb('case_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Q1 — the per-case outcome array (the reserved `EvalRun.per_trace`
    // reshaped into `EvalRun.per_case`, stored alongside the set-level
    // metrics below).
    perCase: jsonb('per_case').$type<EvalCaseOutcome[]>().notNull().default(sql`'[]'::jsonb`),
    casesErrored: integer('cases_errored').notNull().default(0),
    tracesPassed: integer('traces_passed'),
    tracesTotal: integer('traces_total'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorReason: text('error_reason'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    ownerIdx: index('eval_runs_owner_idx').on(
      t.workspaceId,
      t.ownerKind,
      t.ownerId,
      desc(t.ranAt),
    ),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
