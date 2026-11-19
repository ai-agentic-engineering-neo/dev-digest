/** One finished agent run, as needed for PR cost aggregation. */
export interface CostRunRow {
  prId: string;
  agentId: string | null;
  costUsd: number | null;
  ranAt: Date;
}

/**
 * Cost of each PR's CURRENT review: the sum of the newest `done` run per agent.
 * Rows must already be filtered to status='done'. A PR whose latest runs have no
 * cost data is absent from the map (callers render "—", never $0). Re-runs of
 * the same agent replace, not add to, the earlier run.
 */
export function aggregatePrCost(rows: CostRunRow[]): Map<string, number> {
  const latest = new Map<string, CostRunRow>(); // key: prId + agentId
  for (const r of rows) {
    const key = `${r.prId}:${r.agentId ?? ''}`;
    const prev = latest.get(key);
    if (!prev || r.ranAt > prev.ranAt) latest.set(key, r);
  }
  const totals = new Map<string, number>();
  for (const r of latest.values()) {
    if (r.costUsd == null) continue;
    totals.set(r.prId, (totals.get(r.prId) ?? 0) + r.costUsd);
  }
  return totals;
}
