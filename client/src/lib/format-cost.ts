/**
 * Compact USD cost formatter shared by the PR list, the run timeline, and the
 * run trace stat tiles.
 *
 * null/undefined → "—" (no cost data), NEVER "$0.00" — a run/PR with no cost
 * data is distinct from a run that genuinely cost nothing (0).
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3).replace(/0$/, "").replace(/\.$/, "")}`;
}
