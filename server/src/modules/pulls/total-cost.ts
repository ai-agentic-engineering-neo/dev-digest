/**
 * PR-list COST column: the sum of every successful (status='done') run's
 * known cost for that PR — not just the latest "Review all" batch. A re-run
 * adds to the total; that's intentional, since the criterion this satisfies
 * defines cost as the cumulative spend reviewing the PR, not a snapshot of
 * the last pass. Rows with an unpriced (`null`) cost are skipped; a PR whose
 * runs are all unpriced comes back `null` rather than `0` so the UI can tell
 * "reviewed but free" apart from "not priced yet" if that distinction is
 * ever needed.
 */
export function totalCostByPr(
  rows: { prId: string; runId: string; costUsd: number | null }[],
): Map<string, number | null> {
  const result = new Map<string, number | null>();

  for (const row of rows) {
    if (row.costUsd == null) {
      if (!result.has(row.prId)) result.set(row.prId, null);
      continue;
    }
    const current = result.get(row.prId) ?? null;
    result.set(row.prId, current == null ? row.costUsd : current + row.costUsd);
  }

  return result;
}
