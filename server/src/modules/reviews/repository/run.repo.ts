import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { ActiveRun, RunSummary, RunTrace } from '@devdigest/shared';
import type { NewAgentRun, ReviewSkill, RunCompletion, RunState, RunUsage } from '../domain/types.js';

// ---- in-flight / history --------------------------------------------------

/** In-flight runs for a PR (status='running') — the server-side source of
 *  truth for "which agents are running now". Joined with the agent name. */
export async function activeRunsForPull(
  db: DbOrTx,
  workspaceId: string,
  prId: string,
): Promise<ActiveRun[]> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      ranAt: t.agentRuns.ranAt,
      agentName: t.agents.name,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        eq(t.agentRuns.status, 'running'),
      ),
    );
  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}

/** All runs for a PR (any status), newest first — the PR run history. */
export async function listRunsForPull(
  db: DbOrTx,
  workspaceId: string,
  prId: string,
): Promise<RunSummary[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.ranAt));
  return rows.map(({ run, agentName }) => ({
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
  }));
}

/**
 * Usage of the given runs in ONE query — attached to each review DTO
 * (reviews.run_id → agent_runs, ON DELETE CASCADE: a deleted run takes its
 * reviews with it, so every review's run is present in the map).
 */
export async function usageForRuns(db: DbOrTx, runIds: string[]): Promise<Map<string, RunUsage>> {
  if (runIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: t.agentRuns.id,
      tokensIn: t.agentRuns.tokensIn,
      tokensOut: t.agentRuns.tokensOut,
      costUsd: t.agentRuns.costUsd,
    })
    .from(t.agentRuns)
    .where(inArray(t.agentRuns.id, runIds));
  return new Map(rows.map(({ id, ...u }) => [id, u]));
}

/**
 * Delete one agent run AND everything hanging off it, workspace-scoped, in one
 * statement: its trace (run_traces FK cascade) and the review it produced
 * (reviews.run_id → agent_runs ON DELETE CASCADE, migration 0011), whose
 * findings cascade from reviews — so deleting a run from the timeline never
 * leaves orphaned findings in the Review Runs list.
 */
export async function deleteAgentRun(
  db: DbOrTx,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  const rows = await db
    .delete(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** Status (+ failure note) of one run, scoped to the workspace. */
export async function getRunInWorkspace(
  db: DbOrTx,
  workspaceId: string,
  runId: string,
): Promise<RunState | undefined> {
  const [row] = await db
    .select({ id: t.agentRuns.id, status: t.agentRuns.status, error: t.agentRuns.error })
    .from(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)));
  return row;
}

/** Mark a still-running run as cancelled (no-op if it already finished). */
export async function cancelRunIfRunning(
  db: DbOrTx,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled', error: 'Cancelled by user' })
    .where(
      and(
        eq(t.agentRuns.id, runId),
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.status, 'running'),
      ),
    )
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still 'running' is orphaned (its process died / restarted),
 *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
export async function reapStaleRunningRuns(db: DbOrTx): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed' })
    .where(eq(t.agentRuns.status, 'running'))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row in `running` state; returns its id (= the runId). */
export async function createAgentRun(
  db: DbOrTx,
  values: NewAgentRun,
): Promise<string> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: values.workspaceId,
      agentId: values.agentId,
      prId: values.prId,
      provider: values.provider,
      model: values.model,
      status: 'running',
      source: 'local',
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

function statsOf(values: RunCompletion) {
  return {
    durationMs: values.durationMs,
    tokensIn: values.tokensIn,
    tokensOut: values.tokensOut,
    costUsd: values.costUsd,
    findingsCount: values.findingsCount,
    grounding: values.grounding,
    score: values.score ?? null,
    blockers: values.blockers ?? null,
  };
}

/**
 * Mark a run `done` — ONLY if it is still `running`. Returns false when the run
 * left `running` meanwhile (a cancel landed), so the caller can roll back the
 * review it persisted in the same transaction.
 */
export async function completeAgentRunIfRunning(
  db: DbOrTx,
  runId: string,
  values: RunCompletion,
): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'done', ...statsOf(values), error: values.error ?? null })
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.status, 'running')))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/**
 * Record a failed/cancelled run's stats (usage spent so far, duration, trace
 * note). The status moves to `status` only from `running`; a run the cancel
 * route already flipped to `cancelled` stays cancelled (its usage is still
 * written). A `done` run is never touched. Returns the resulting status.
 */
export async function failAgentRun(
  db: DbOrTx,
  runId: string,
  status: 'failed' | 'cancelled',
  values: RunCompletion,
): Promise<string | null> {
  const [row] = await db
    .update(t.agentRuns)
    .set({
      ...statsOf(values),
      status: sql`CASE WHEN ${t.agentRuns.status} = 'running' THEN ${status}::text ELSE ${t.agentRuns.status} END`,
      error: sql`CASE WHEN ${t.agentRuns.status} = 'running' THEN ${values.error ?? null}::text ELSE coalesce(${t.agentRuns.error}, 'Cancelled by user') END`,
    })
    .where(
      and(eq(t.agentRuns.id, runId), inArray(t.agentRuns.status, ['running', 'cancelled'])),
    )
    .returning({ status: t.agentRuns.status });
  return row?.status ?? null;
}

/** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
export async function saveRunTrace(db: DbOrTx, runId: string, trace: RunTrace): Promise<void> {
  await db
    .insert(t.runTraces)
    .values({ runId, trace })
    .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
}

/**
 * The stored trace document of a run in the workspace, UNVALIDATED (jsonb is
 * whatever was written) — the caller parses it. `null` = run found, no trace.
 */
export async function getRunTraceInWorkspace(
  db: DbOrTx,
  workspaceId: string,
  runId: string,
): Promise<{ trace: unknown } | undefined> {
  const [row] = await db
    .select({ trace: t.runTraces.trace })
    .from(t.runTraces)
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runTraces.runId))
    .where(and(eq(t.runTraces.runId, runId), eq(t.agentRuns.workspaceId, workspaceId)));
  return row;
}

// ---- skills attached to a run ----------------------------------------------

/** agent_run_skills rows: each attached skill at its exact version, in prompt order. */
export async function recordRunSkills(db: DbOrTx, runId: string, skills: readonly ReviewSkill[]): Promise<void> {
  if (skills.length === 0) return;
  await db
    .insert(t.agentRunSkills)
    .values(skills.map((s, order) => ({ runId, skillId: s.id, skillVersion: s.version, order })))
    .onConflictDoNothing();
}

/** The agent's linked, ENABLED skills in link order (a disabled skill stays linked but is skipped). */
export async function enabledSkillsForAgent(db: DbOrTx, agentId: string): Promise<ReviewSkill[]> {
  return db
    .select({
      id: t.skills.id,
      name: t.skills.name,
      description: t.skills.description,
      body: t.skills.body,
      version: t.skills.version,
    })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
    .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
    .orderBy(t.agentSkills.order);
}
