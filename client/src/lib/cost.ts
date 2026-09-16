/* cost.ts — USD formatting for review-run costs, shared by the PR list, the
   run timeline, and the trace stats row. Per-run costs are fractions of a
   cent, so sub-dollar values keep an extra decimal; a null cost (unknown
   model price, failed before billing) renders as an em-dash, never $0.00. */

/** Badge-style cost: `$0.014` under $1, `$1.25` above; `—` when null. */
export function formatCost(usd?: number | null): string {
  if (usd == null) return "—";
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

/** Precise cost for the per-run timeline meta line: always 4 decimals. */
export function formatCostPrecise(usd?: number | null): string {
  return usd == null ? "—" : `$${usd.toFixed(4)}`;
}
