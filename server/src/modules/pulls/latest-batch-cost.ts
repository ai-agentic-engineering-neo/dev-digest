/**
 * PR-list COST column: the sum of `cost_usd` over every `status='done'` run in
 * a PR's LATEST review batch (the set of agent_runs launched together by one
 * "Run Review" click), not just the single most-recent run — a failed agent
 * in that batch contributes nothing, but doesn't null out its siblings' spend.
 *
 * Mirrors the read-time derivation already used for the list's SCORE column
 * (newest-first, first-seen-per-PR wins), grouped by `batch_id` instead of by
 * review row. Runs from before `batch_id` existed (null) are their own
 * singleton batch (falls back to `id`), degrading gracefully to "just this run".
 */

export interface AgentRunCostRow {
  prId: string | null;
  id: string;
  batchId: string | null;
  status: string | null;
  costUsd: number | null;
}

/** `runs` MUST be sorted newest-first (e.g. `ORDER BY ran_at DESC`). */
export function latestBatchCostByPr(runs: AgentRunCostRow[]): Map<string, number | null> {
  const latestKeyByPr = new Map<string, string>();
  const result = new Map<string, number>();
  const hasDoneRun = new Set<string>();

  for (const r of runs) {
    if (!r.prId) continue;
    const key = r.batchId ?? r.id;
    if (!latestKeyByPr.has(r.prId)) latestKeyByPr.set(r.prId, key);
    if (latestKeyByPr.get(r.prId) !== key) continue; // not part of this PR's latest batch
    if (r.status !== 'done') continue; // failed/cancelled/running runs contribute nothing

    hasDoneRun.add(r.prId);
    result.set(r.prId, (result.get(r.prId) ?? 0) + (r.costUsd ?? 0));
  }

  // A PR whose latest batch has zero completed runs (e.g. every agent errored) → null, not 0.
  const out = new Map<string, number | null>();
  for (const prId of latestKeyByPr.keys()) out.set(prId, hasDoneRun.has(prId) ? result.get(prId)! : null);
  return out;
}
