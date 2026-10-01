import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, check } from 'drizzle-orm/pg-core';
import type { IntentRiskArea, IntentSourceRef } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

/**
 * Derived, provenance-tracked intent of a PR at one head commit (one row per
 * PR, overwritten on regenerate). `input_hash` fingerprints the evidence the
 * classifier saw so an unchanged PR is a cache hit. Its cost lives ONLY here —
 * never in agent_runs.cost_usd.
 */
export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    headSha: text('head_sha').notNull(),
    inputHash: text('input_hash').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    confidenceLevel: text('confidence_level').notNull(),
    primarySource: text('primary_source').notNull(),
    sourcesUsed: jsonb('sources_used').$type<IntentSourceRef[]>().notNull().default(sql`'[]'::jsonb`),
    riskAreas: jsonb('risk_areas').$type<IntentRiskArea[]>().notNull().default(sql`'[]'::jsonb`),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** USD spent deriving this intent; null when the model is unpriced. */
    costUsd: doublePrecision('cost_usd'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('pr_intent_confidence_level_check', sql`${t.confidenceLevel} IN ('low','medium','high')`),
    check(
      'pr_intent_primary_source_check',
      sql`${t.primarySource} IN ('description','linked_issue','plan_spec','commits','branch','file_paths')`,
    ),
  ],
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
