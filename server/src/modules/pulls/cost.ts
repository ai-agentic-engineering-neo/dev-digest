/**
 * PR-list cost rollup (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * The list's COST column is the TOTAL spend on a PR: the sum of `cost_usd` over
 * its completed runs. Runs with an unknown cost (null — unpriced model or a run
 * from before cost was recorded) are skipped rather than poisoning the sum; a PR
 * with no known cost at all is absent from the map, so the route emits null and
 * the UI renders "—", never "$0".
 */
export function sumRunCosts(
  runs: { prId: string | null; costUsd: number | null }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of runs) {
    if (r.prId == null || r.costUsd == null) continue;
    totals.set(r.prId, (totals.get(r.prId) ?? 0) + r.costUsd);
  }
  return totals;
}
