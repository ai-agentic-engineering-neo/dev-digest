/**
 * Run cost / token formatting shared by the PR list, the run timeline and the
 * run trace drawer (Run Cost Badge). Missing data renders "—", never "$0.00".
 */

/** Placeholder for an unknown cost (failed run, unpriced model, legacy row). */
export const NO_COST = "—";

/**
 * USD → "$0.014" / "$0.0013" / "$0.06" (2 significant digits below $1) or
 * "$1.24" (2 decimals from $1 up). null/undefined → "—".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_COST;
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${Number(usd.toPrecision(2)).toString()}`;
}

/** 9119 → "9 119" (space-grouped, like the design). */
export function formatTokenCount(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
