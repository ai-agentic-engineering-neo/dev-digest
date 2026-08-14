import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
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

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

/**
 * `pr_brief` — one row per pull request, the ONE stored PR Why + Risk Brief
 * (specs/11-why-risk-brief.md, D6/D8: redesigned in place — see
 * `server/LEARNINGS.md`'s "reserved-but-unwired" pattern; confirmed 0 rows
 * before this migration, so `NOT NULL` without a default on `head_sha`/
 * `model` is safe). A row exists ONLY for a successful generation — a failed
 * generation writes nothing (AC-28) and `ON DELETE cascade` from
 * `pull_requests` means no brief can outlive its PR.
 *
 * `head_sha` (D9) is the state key. `index_sha`/`index_status`/
 * `indexer_version`/`intent_resolved_at` are staleness MARKERS, recorded at
 * generation time, never part of the cache key — staleness itself is always
 * computed at read time (AC-25/AC-30), never stored as a boolean/status.
 */
export const prBrief = pgTable(
  'pr_brief',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    json: jsonb('json').notNull(), // the grounded PrBrief (what/why/risk_level/risks/review_focus)
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    headSha: text('head_sha').notNull(), // D9 — the state key
    // --- AC-29/AC-30 staleness markers, frozen at generation time ---
    indexSha: text('index_sha'), // AC-32: an absent/degraded index still generates
    indexStatus: text('index_status'),
    indexerVersion: integer('indexer_version'),
    intentResolvedAt: timestamp('intent_resolved_at', { withTimezone: true }), // AC-35: intent may be absent
    // --- AC-29/AC-43 spend record ---
    provider: text('provider'),
    model: text('model').notNull(),
    attempts: integer('attempts').notNull().default(1),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: doublePrecision('cost_usd'),
    droppedInputs: integer('dropped_inputs').notNull().default(0), // AC-8
  },
  (t) => ({
    headShaIdx: index('pr_brief_head_sha_idx').on(t.headSha),
  }),
);
