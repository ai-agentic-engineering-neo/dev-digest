/**
 * Cost for the PR list: the cost of the run that produced the PR's latest
 * review — the same review the score ring is taken from — so the list's cost and
 * score always describe one run. A run that isn't `done`, no longer exists, or
 * has unknown cost yields null (rendered "--"), never another run's number.
 */
export interface RunCostRow {
  id: string;
  status: string | null;
  costUsd: number | null;
}

export function costOfLatestReviewRun(
  latestRunIdByPr: Map<string, string | null>,
  runs: RunCostRow[],
): Map<string, number | null> {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const out = new Map<string, number | null>();
  for (const [prId, runId] of latestRunIdByPr) {
    const r = runId ? byId.get(runId) : undefined;
    out.set(prId, r && r.status === 'done' ? r.costUsd : null);
  }
  return out;
}
