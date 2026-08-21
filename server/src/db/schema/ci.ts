import { desc } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { agentRuns } from './runs';

// specs/14-export-to-ci.md (D1/D-P3) — `ci_installations`/`ci_runs` reshaped
// in place. Both tables were confirmed empty and unread before this migration
// (server/LEARNINGS.md's "reserved-but-unwired" pattern), so adding NOT NULL
// columns without a default is safe here.

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // D-P3 — reached transitively through `agentId` alone would break for
    // the "agent deleted, run survives orphaned" edge case (ci_runs.
    // ci_installation_id goes null); a direct column keeps AC-24 enforceable
    // on every row.
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    // The dedicated branch DevDigest publishes to (e.g. "devdigest/ci") and
    // the base branch the PR targets.
    branch: text('branch').notNull(),
    base: text('base').notNull(),
    // Path to the generated workflow file in the target repo, e.g.
    // ".github/workflows/devdigest.yml" — what ingestion filters
    // `listWorkflowRuns` on.
    workflowPath: text('workflow_path').notNull(),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] }).notNull(),
    triggers: jsonb('triggers').$type<string[]>().notNull(),
    // The last known open PR for this installation's branch, if any.
    prUrl: text('pr_url'),
    lastExportAt: timestamp('last_export_at', { withTimezone: true }),
    // AC-29 — the per-installation refresh debounce's own bookkeeping;
    // `null` before the first refresh ever runs against this installation.
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // AC-7 — the exact (agent, repo, target) tuple a republish reuses.
    tupleUq: uniqueIndex('ci_installations_tuple_uq').on(
      t.workspaceId,
      t.agentId,
      t.repo,
      t.targetType,
    ),
    // AC-59/D18 — one agent per repository, enforced as a real unique index:
    // the runner throws when it finds more than one manifest under
    // `.devdigest/agents/`, so a second installation for the same repo
    // (even a different agent) would break the first one's workflow.
    repoUq: uniqueIndex('ci_installations_repo_uq').on(t.workspaceId, t.repo),
    // The CI tab's own list read: every installation for one agent.
    agentIdx: index('ci_installations_ws_agent_idx').on(t.workspaceId, t.agentId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // D-P3 — same rationale as ciInstallations.workspaceId: a direct column
    // so AC-24 stays enforceable even after `ciInstallationId` goes null
    // (agent/installation deleted, run survives orphaned).
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    // The CI provider's own run id (GitHub Actions `run.id`) — what AC-19's
    // idempotent upsert is keyed on, backed by the unique index below.
    providerRunId: text('provider_run_id').notNull(),
    prNumber: integer('pr_number'),
    prTitle: text('pr_title'),
    prUrl: text('pr_url'),
    commitSha: text('commit_sha'),
    agentName: text('agent_name'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    // CiRunStatus values ('succeeded'|'failed'|'no_findings'|'running'); kept
    // as free text at the DB level (validated by the service against the
    // shared contract before write, same posture as the pre-existing column).
    status: text('status'),
    findingsCount: integer('findings_count'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    // Which value `durationMs` holds — the runner's own review duration from
    // the result artifact, or the CI provider's whole-job wall-clock time
    // when no artifact was published (plans/14 clarification 2).
    durationSource: text('duration_source', { enum: ['artifact', 'provider'] }),
    githubUrl: text('github_url'),
    // Reserved column name (D1): the CI system that produced this run —
    // 'gha' today (D13/AC-2).
    source: text('source'),
    // Set only when status = 'failed' — names the failed check (AC-18) or
    // why the run has no artifact (AC-21).
    failureReason: text('failure_reason'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }),
  },
  (t) => ({
    // AC-19 — the DB-level guarantee that repeated refreshes of the same
    // provider run converge on one row; not application-logic idempotency.
    providerRunUq: uniqueIndex('ci_runs_provider_run_uq').on(t.workspaceId, t.providerRunId),
    listIdx: index('ci_runs_list_idx').on(t.workspaceId, desc(t.ranAt)),
  }),
);
