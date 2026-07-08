import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { ciInstallations } from './ci';

// ============================================================ Observability

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
    // Nullable link to the persistent multi-agent run this agent run belongs to,
    // when it was fanned out as part of a multi-agent review (see multiAgentRuns
    // below). Arrow-fn reference avoids a TDZ/circular-ref error even though
    // multiAgentRuns is declared further down this file.
    multiRunId: uuid('multi_run_id').references(() => multiAgentRuns.id, { onDelete: 'set null' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    provider: text('provider'),
    model: text('model'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    status: text('status'),
    /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
    error: text('error'),
    source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
    findingsCount: integer('findings_count'),
    grounding: text('grounding'),
    /** Review score (0-100) for this run; null on failed/cancelled runs. */
    score: integer('score'),
    /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
    blockers: integer('blockers'),
    /** CI installation that produced this run, when ingested from a CI workflow. */
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    /** "owner/name" of the repo the run was executed against (CI-ingested runs). */
    repo: text('repo'),
    /** GitHub PR number on the external repo (CI-ingested runs; not the internal `pr_id`). */
    externalPrNumber: integer('external_pr_number'),
    /** GitHub Actions run id — used together with `ci_installation_id` for ingest idempotency. */
    actionsRunId: text('actions_run_id'),
    /** Link to the GitHub Actions job that produced this run. */
    actionsJobUrl: text('actions_job_url'),
  },
  (t) => ({
    ciInstallationIdx: index('agent_runs_ci_installation_id_idx').on(t.ciInstallationId),
    ciInstallationActionsRunUq: uniqueIndex('agent_runs_ci_installation_actions_run_uq').on(
      t.ciInstallationId,
      t.actionsRunId,
    ),
    multiRunIdx: index('agent_runs_multi_run_idx').on(t.multiRunId),
  }),
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
