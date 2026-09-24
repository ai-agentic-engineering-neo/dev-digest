import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  numeric,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import type { IntentSource } from '@devdigest/shared';
import { now, enumCheck } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { agentRuns } from './runs';
import { skills } from './skills';

// ============================================================ Review & findings

export const REVIEW_KINDS = ['summary', 'review'] as const;
/** = Severity / FindingCategory / FindingKind in @devdigest/shared (contract test keeps them in sync). */
export const FINDING_SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
export const FINDING_CATEGORIES = ['bug', 'security', 'perf', 'style', 'test'] as const;
export const FINDING_KINDS = ['finding', 'secret_leak', 'lethal_trifecta', 'phantom', 'hook'] as const;

/** = IntentChangeType / IntentDerivedFrom in @devdigest/shared (server/specs/05-intent-layer.md). */
export const INTENT_CHANGE_TYPES = [
  'feature',
  'bugfix',
  'refactor',
  'docs',
  'test',
  'chore',
  'security',
  'perf',
  'mixed',
] as const;
export const INTENT_DERIVED_FROM = ['explicit', 'inferred'] as const;
export const INTENT_CONFIDENCE = ['high', 'medium', 'low'] as const;

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    /** Deleting the agent keeps its reviews (agent name then shows as unknown). */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** The agent_run that produced this review (links the timeline run ↔ review).
     *  Deleting the run deletes its review (+ findings, which cascade from reviews). */
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: REVIEW_KINDS }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => [
    index('reviews_pr_created_idx').on(t.prId, t.createdAt),
    index('reviews_run_idx').on(t.runId),
    index('reviews_agent_idx').on(t.agentId),
    enumCheck('reviews_kind_chk', t.kind, REVIEW_KINDS),
  ],
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity', { enum: FINDING_SEVERITIES }).notNull(),
    category: text('category', { enum: FINDING_CATEGORIES }).notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind', { enum: FINDING_KINDS }).notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    /** The skill this finding enforces (Finding.skill resolved against the run's
     *  attached skills). Null when the model cited none or an unknown name. */
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    /** The skill name exactly as the model cited it (kept even when unresolved). */
    skillName: text('skill_name'),
    /** Set by reviewer-core's applyScopePolicy (server/specs/05-intent-layer.md);
     *  never drops the finding or changes its severity. */
    outOfScope: boolean('out_of_scope').notNull().default(false),
  },
  (t) => [
    index('findings_review_idx').on(t.reviewId),
    index('findings_skill_idx').on(t.skillId),
    enumCheck('findings_severity_chk', t.severity, FINDING_SEVERITIES),
    enumCheck('findings_category_chk', t.category, FINDING_CATEGORIES),
    enumCheck('findings_kind_chk', t.kind, FINDING_KINDS),
  ],
);

/**
 * One row per PR (server/specs/05-intent-layer.md). `outOfScope` here is the
 * LEGACY column name (Intent.out_of_scope, a string[]) — unrelated to
 * `findings.outOfScope` (a per-finding boolean flag) above.
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
    changeType: text('change_type', { enum: INTENT_CHANGE_TYPES }),
    confidence: text('confidence', { enum: INTENT_CONFIDENCE }),
    // NOT NULL + a default (never actually read as such — application code
    // always sets it explicitly on upsert; the default only lets drizzle-kit
    // generate the add-column migration without an interactive backfill
    // prompt, since pr_intent is verified empty — server/INSIGHTS.md).
    derivedFrom: text('derived_from', { enum: INTENT_DERIVED_FROM }).notNull().default('inferred'),
    /** Every input the layer considered (IntentSource[]); [] until derived. */
    sources: jsonb('sources').$type<IntentSource[]>().notNull().default(sql`'[]'::jsonb`),
    headSha: text('head_sha'),
    /** sha256 of the canonical cache-key input; drives cache hit/miss. */
    inputHash: text('input_hash'),
    promptVersion: integer('prompt_version'),
    provider: text('provider'),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    /** USD; null = unpriced model. Billed here + the run's trace, never agent_runs.cost_usd. */
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }),
    derivedAt: timestamp('derived_at', { withTimezone: true }),
  },
  (t) => [
    enumCheck('pr_intent_change_type_chk', t.changeType, INTENT_CHANGE_TYPES),
    enumCheck('pr_intent_derived_from_chk', t.derivedFrom, INTENT_DERIVED_FROM),
    enumCheck('pr_intent_confidence_chk', t.confidence, INTENT_CONFIDENCE),
  ],
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
