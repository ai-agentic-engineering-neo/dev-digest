import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
} from 'drizzle-orm/pg-core';
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
  },
  (t) => [
    index('findings_review_idx').on(t.reviewId),
    index('findings_skill_idx').on(t.skillId),
    enumCheck('findings_severity_chk', t.severity, FINDING_SEVERITIES),
    enumCheck('findings_category_chk', t.category, FINDING_CATEGORIES),
    enumCheck('findings_kind_chk', t.kind, FINDING_KINDS),
  ],
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
