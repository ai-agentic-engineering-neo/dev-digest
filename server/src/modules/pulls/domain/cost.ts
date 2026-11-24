/**
 * PR cost for the PR list's COST column (spec: docs/features/run-cost/spec.md §4.2).
 *
 * PR cost = sum of `cost_usd` over the LATEST non-running run of EACH agent.
 * Runs whose agent was deleted (agentId null) are ignored. A latest run with
 * unknown cost contributes nothing (it shadows older runs of that agent — by
 * design: "what the current review set cost", not "total ever spent").
 * No known cost at all → null (the UI renders "—", never "$0.00").
 */
export interface RunCostRow {
  prId: string;
  agentId: string | null;
  status: string | null;
  costUsd: number | null;
}

/** `rows` MUST be ordered newest-first (ran_at desc). */
export function aggregatePrCosts(rows: RunCostRow[]): Map<string, number | null> {
  const seen = new Set<string>();
  const totals = new Map<string, number | null>();
  for (const r of rows) {
    if (r.agentId == null || r.status === 'running') continue;
    const key = `${r.prId}|${r.agentId}`;
    if (seen.has(key)) continue; // an older run of an agent already counted
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
