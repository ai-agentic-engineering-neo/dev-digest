/**
 * USD cost of an agent run / PR, one format for every surface
 * (spec: docs/features/run-cost/spec.md §4.3).
 *   null/undefined → "—" (no data — never "$0.00")
 *   0              → "$0.00" (free model with real usage)
 *   < $0.01        → 4 decimals ("$0.0013")
 *   < $1           → 3 decimals ("$0.014")
 *   ≥ $1           → 2 decimals ("$1.27")
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  const decimals = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `$${usd.toFixed(decimals)}`;
}
