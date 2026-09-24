import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, numeric, index, primaryKey } from 'drizzle-orm/pg-core';
import { enumCheck } from './_shared';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { skills } from './skills';

// ============================================================ Observability

export const AGENT_RUN_STATUSES = ['running', 'done', 'failed', 'cancelled'] as const;
export const AGENT_RUN_SOURCES = ['local', 'ci'] as const;

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    provider: text('provider'),
    model: text('model'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    /** USD cost of every LLM response the run received — failed/cancelled runs
     *  included (0 when no LLM call happened). NULL = unpriced model, orphaned
     *  run, or a run recorded before cost tracking. */
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }),
    status: text('status', { enum: AGENT_RUN_STATUSES }),
    /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
    error: text('error'),
    source: text('source', { enum: AGENT_RUN_SOURCES }).notNull().default('local'),
    findingsCount: integer('findings_count'),
    grounding: text('grounding'),
    /** Review score (0-100) for this run; null on failed/cancelled runs. */
    score: integer('score'),
    /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
    blockers: integer('blockers'),
  },
  (t) => [
    // PR run history (newest first) + the per-PR cost SUM.
    index('agent_runs_pr_ran_idx').on(t.prId, t.ranAt),
    // In-flight runs: tiny partial index for the "running now" lookups + boot reaper.
    index('agent_runs_running_idx').on(t.prId).where(sql`${t.status} = 'running'`),
    enumCheck('agent_runs_status_chk', t.status, AGENT_RUN_STATUSES),
    enumCheck('agent_runs_source_chk', t.source, AGENT_RUN_SOURCES),
  ],
);

/**
 * The skills (at their exact version) that were in a run's prompt, in prompt
 * order. Written when the run starts; the base of the skill stats (pull rate).
 */
export const agentRunSkills = pgTable(
  'agent_run_skills',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    skillVersion: integer('skill_version').notNull(),
    order: integer('order').notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.skillId] }), index('agent_run_skills_skill_idx').on(t.skillId)],
);

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
});
