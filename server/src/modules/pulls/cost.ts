/**
 * PR-list COST rollup (pure — unit-tests without a DB).
 *
 * A PR's cost is the SUM of `cost_usd` over its completed (`done`) runs. Runs
 * with an unknown cost (null — unpriced model, legacy rows) are skipped; a PR
 * where no completed run has a known cost maps to null so the UI shows "—",
 * never a misleading "$0.00".
 */
export function sumRunCostByPr(
  rows: { prId: string | null; status: string | null; costUsd: number | null }[],
): Map<string, number> {
  const byPr = new Map<string, number>();
  for (const r of rows) {
    if (!r.prId || r.status !== 'done' || r.costUsd == null) continue;
    byPr.set(r.prId, (byPr.get(r.prId) ?? 0) + r.costUsd);
  }
  return byPr;
}
