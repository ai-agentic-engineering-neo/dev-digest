/**
 * Format a run/review cost in USD — mirrors the design's `CostBadge` / stat formatting.
 *
 * - `null` / `undefined` → "—" (no run yet, failed run, or unknown model price).
 * - default: under $1 → 3 decimals ("$0.014"; tiny sums read "$0.000"), $1 and up → 2 decimals ("$1.25").
 * - `digits` overrides the precision (timeline rows use 4 → "$0.0013", the trace stats tile uses 2 → "$0.06").
 */
export function formatCost(usd: number | null | undefined, opts?: { digits?: number }): string {
  if (usd == null) return "—";
  if (opts?.digits != null) return "$" + usd.toFixed(opts.digits);
  return usd < 1 ? "$" + usd.toFixed(3) : "$" + usd.toFixed(2);
}
