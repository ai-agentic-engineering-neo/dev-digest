/**
 * PR-list COST column: the sum of the latest "Review all" batch's known costs.
 *
 * A batch = every agent_runs row sharing a batchId (or, for pre-batchId runs,
 * a lone row keyed by its own runId). The newest DONE run per PR selects
 * which batch is "latest" — running/failed/cancelled runs never count and
 * never pick the batch, so a PR mid-review keeps showing its last completed
 * batch's cost instead of flashing to `—` or a partial number.
 */
export function latestBatchCostByPr(
  rows: { prId: string; batchId: string | null; runId: string; costUsd: number | null }[],
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  const seenBatchKeyByPr = new Map<string, string>();

  for (const row of rows) {
    const batchKey = row.batchId ?? row.runId;
    let latestBatchKey = seenBatchKeyByPr.get(row.prId);
    if (latestBatchKey === undefined) {
      // Rows are newest-first: the first row seen for this PR defines its
      // latest batch.
      latestBatchKey = batchKey;
      seenBatchKeyByPr.set(row.prId, latestBatchKey);
      result.set(row.prId, row.costUsd);
      continue;
    }
    if (batchKey !== latestBatchKey) continue;
    const current = result.get(row.prId) ?? null;
    if (row.costUsd == null) continue;
    result.set(row.prId, current == null ? row.costUsd : current + row.costUsd);
  }

  return result;
}
