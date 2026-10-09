/** Format a run's USD cost estimate. `null`/`undefined` = no data (unpriced
 *  model, failed/cancelled run, or a PR never reviewed) — always "—", never
 *  "$0.00" (which is reserved for a genuinely free run). */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}
