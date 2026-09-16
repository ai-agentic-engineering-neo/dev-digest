/* cost.ts — USD formatting for review-run costs, shared by the PR list, the
   run timeline, and the trace stats row. Real per-run costs are often
   fractions of a cent (cheap models, small diffs), so fixed decimals would
   round them to "$0.000" — instead keep 2 significant digits (2–6 decimals):
   $1.25 · $0.060 · $0.0013 · $0.000038. A null cost (unknown model price,
   failed before billing) renders as an em-dash, never $0.00. */

/** Cost with 2 significant digits (2–6 decimals); `—` when null. */
export function formatCost(usd?: number | null): string {
  if (usd == null) return "—";
  if (usd <= 0) return "$0.00";
  const decimals = Math.min(6, Math.max(2, 1 - Math.floor(Math.log10(usd))));
  return `$${usd.toFixed(decimals)}`;
}
