/**
 * USD cost of an agent run (or a PR's summed runs), with precision that adapts
 * to the amount so cheap runs don't collapse to "$0.00":
 *   < $0.01 → 4 dp ($0.0013) · < $1 → 3 dp ($0.014) · otherwise 2 dp ($1.24).
 * Unknown cost (unpriced model, failed or pre-migration run) → "—", never "$0.00".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || Number.isNaN(usd)) return "—";
  const digits = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `$${usd.toFixed(digits)}`;
}
