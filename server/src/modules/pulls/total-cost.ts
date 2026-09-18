/**
 * PR-list COST column: the sum of `cost_usd` over every `status='done'` run
 * ever executed against a PR (not just the latest review batch) — the list
 * shows total spend on a PR across its whole review history.
 */

export interface AgentRunCostRow {
  prId: string | null;
  status: string | null;
  costUsd: number | null;
}

export function totalCostByPr(runs: AgentRunCostRow[]): Map<string, number | null> {
  const result = new Map<string, number>();
  const hasDoneRun = new Set<string>();

  for (const r of runs) {
    if (!r.prId || r.status !== 'done') continue; // failed/cancelled/running runs contribute nothing
    hasDoneRun.add(r.prId);
    result.set(r.prId, (result.get(r.prId) ?? 0) + (r.costUsd ?? 0));
  }

  // A PR with zero completed runs (e.g. never reviewed, or every run errored) → null, not 0.
  const out = new Map<string, number | null>();
  for (const prId of new Set(runs.map((r) => r.prId).filter((id): id is string => !!id))) {
    out.set(prId, hasDoneRun.has(prId) ? result.get(prId)! : null);
  }
  return out;
}
