/**
 * Run cost (PR list COST column): pure helpers that turn persisted agent runs into the
 * "cost of the latest run" shown on each PR row of the list.
 */

/** Estimates USD from token counts; returns null when the model's price is unknown. */
export type CostEstimator = (model: string, tokensIn: number, tokensOut: number) => number | null;

/** The slice of an `agent_runs` row (+ its trace stats) needed to price a run. */
export interface PricedRun {
  prId: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  /** `agent_runs.cost_usd`; null when the run predates cost tracking or the price is unknown. */
  costUsd: number | null | undefined;
}

/**
 * USD cost of one run. Prefers the persisted `agent_runs.cost_usd` (summed by
 * reviewer-core over every model call, real OpenRouter cost when available);
 * falls back to estimating from the run's token usage for older runs.
 */
export function runCostUsd(run: PricedRun, estimate: CostEstimator): number | null {
  if (typeof run.costUsd === 'number') return run.costUsd;
  if (!run.model || run.tokensIn == null || run.tokensOut == null) return null;
  if (run.tokensIn === 0 && run.tokensOut === 0) return null;
  return estimate(run.model, run.tokensIn, run.tokensOut);
}

/**
 * Latest-run cost per PR. `runs` must be ordered newest-first; the first run
 * seen for a PR wins, even when its cost is unknown, so the badge never shows
 * an older run's cost as if it were the latest.
 */
export function latestRunCostByPr(
  runs: PricedRun[],
  estimate: CostEstimator,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const run of runs) {
    if (!run.prId || out.has(run.prId)) continue;
    out.set(run.prId, runCostUsd(run, estimate));
  }
  return out;
}
