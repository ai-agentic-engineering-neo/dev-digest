import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

export type MultiAgentRunRow = typeof t.multiAgentRuns.$inferSelect;
export type AgentRunRow = typeof t.agentRuns.$inferSelect;

/** Create one `multi_agent_runs` grouping row; returns its id (AC-21). */
export async function createMultiAgentRun(
  db: Db,
  values: { workspaceId: string; prId: string },
): Promise<string> {
  const [row] = await db
    .insert(t.multiAgentRuns)
    .values({ workspaceId: values.workspaceId, prId: values.prId })
    .returning({ id: t.multiAgentRuns.id });
  return row!.id;
}

/** One UPDATE ... WHERE id = ANY($runIds) — never per-row
 *  (server/LEARNINGS.md:184-196's house pattern). */
export async function attachRunsToMultiAgentRun(
  db: Db,
  multiAgentRunId: string,
  runIds: string[],
): Promise<void> {
  if (runIds.length === 0) return;
  await db
    .update(t.agentRuns)
    .set({ multiAgentRunId })
    .where(inArray(t.agentRuns.id, runIds));
}

/** The newest `multi_agent_runs` row for a PR, workspace-scoped (D11, AC-25,
 *  AC-55). Does not filter on status — a run that failed entirely is still
 *  "has a run" for resume purposes (the spec's edge case). */
export async function latestMultiAgentRunForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<MultiAgentRunRow | undefined> {
  const [row] = await db
    .select()
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  return row;
}

/**
 * The in-flight guard (AC-12): the newest multi-agent run for this PR that
 * still has at least one grouped `agent_runs` row with status='running'.
 * DB-backed so it survives a restart.
 */
export async function inFlightMultiAgentRunForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<MultiAgentRunRow | undefined> {
  const rows = await db
    .selectDistinct({ run: t.multiAgentRuns })
    .from(t.multiAgentRuns)
    .innerJoin(t.agentRuns, eq(t.agentRuns.multiAgentRunId, t.multiAgentRuns.id))
    .where(
      and(
        eq(t.multiAgentRuns.workspaceId, workspaceId),
        eq(t.multiAgentRuns.prId, prId),
        eq(t.agentRuns.status, 'running'),
      ),
    )
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  return rows[0]?.run;
}

/**
 * Every `agent_runs` row for one grouping, joined to the agent's name. One
 * query — no per-row lookups. Ordered by id (stable, unique) rather than left
 * unordered — an unordered query gives Postgres no obligation to return the
 * same row order twice (server/LEARNINGS.md's `getFileRankRows` lesson);
 * `MultiAgentService`/`computeConflicts` additionally re-sort by agent_id
 * themselves, but this is the query-level half of that determinism.
 */
export async function groupedRuns(
  db: Db,
  multiAgentRunId: string,
): Promise<{ run: AgentRunRow; agentName: string | null }[]> {
  return db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(eq(t.agentRuns.multiAgentRunId, multiAgentRunId))
    .orderBy(asc(t.agentRuns.id));
}

/**
 * Per-agent historical averages over DONE runs only (server/LEARNINGS.md:
 * 184-196's "gate on status==='done'" rule). The join condition itself
 * filters to 'done' rows (rather than a WHERE, which would drop an agent
 * with zero done runs entirely) — that's what makes an agent with no
 * completed run still come back with `runs: 0` and null averages (AC-5,
 * D22), rather than being silently omitted.
 */
export async function agentRunEstimates(
  db: Db,
  workspaceId: string,
): Promise<
  { agent_id: string; agent_name: string; runs: number; avg_duration_ms: number | null; avg_cost_usd: number | null }[]
> {
  const rows = await db
    .select({
      agentId: t.agents.id,
      agentName: t.agents.name,
      runs: sql<string>`count(${t.agentRuns.id})`,
      avgDuration: sql<string | null>`avg(${t.agentRuns.durationMs})`,
      avgCost: sql<string | null>`avg(${t.agentRuns.costUsd})`,
    })
    .from(t.agents)
    .leftJoin(t.agentRuns, and(eq(t.agentRuns.agentId, t.agents.id), eq(t.agentRuns.status, 'done')))
    .where(eq(t.agents.workspaceId, workspaceId))
    .groupBy(t.agents.id, t.agents.name);
  return rows.map((r) => ({
    agent_id: r.agentId,
    agent_name: r.agentName,
    runs: Number(r.runs) || 0,
    avg_duration_ms: r.avgDuration != null ? Math.round(Number(r.avgDuration)) : null,
    avg_cost_usd: r.avgCost != null ? Number(r.avgCost) : null,
  }));
}
