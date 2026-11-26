/**
 * M1 — PR-list COST column: the cost of the PR's *latest review round*.
 *
 * "Latest round" = the newest run of EACH agent on the PR; the column is the
 * sum of those runs' `cost_usd`. Older/re-run attempts of the same agent are
 * ignored. A latest run with no known cost (failed, cancelled, still running,
 * unpriced model) contributes nothing; if no run in the round has a known
 * cost, the PR's cost is null (UI shows "—", never "$0.00").
 * Runs whose agent was deleted (agentId null) belong to no round → skipped.
 */
export interface RunCostRow {
  prId: string | null;
  agentId: string | null;
  costUsd: number | null;
}

/** @param rows agent_runs rows ordered NEWEST FIRST (ran_at desc). */
export function latestRoundCost(rows: readonly RunCostRow[]): Map<string, number | null> {
  const seen = new Set<string>(); // `${prId}:${agentId}` already taken
  const totals = new Map<string, number | null>();
  for (const r of rows) {
    if (!r.prId || !r.agentId) continue;
    const key = `${r.prId}:${r.agentId}`;
    if (seen.has(key)) continue; // an older run of this agent
    seen.add(key);
    const prev = totals.get(r.prId) ?? null;
    if (r.costUsd == null) {
      if (!totals.has(r.prId)) totals.set(r.prId, null);
      continue;
    }
    totals.set(r.prId, (prev ?? 0) + r.costUsd);
  }
  return totals;
}
