/* lib/format.ts — generic, domain-agnostic display formatters. */

/**
 * USD cost at 3 significant digits (e.g. "$0.012", "$1.23"). null/undefined
 * or exactly 0 → em-dash — never "$0.00", per the spec for "no data".
 */
export function formatCost(cost: number | null | undefined): string {
  if (cost == null || cost === 0) return "—";
  const precise = cost.toPrecision(3);
  // Guard against scientific notation on sub-microcent values: fall back to
  // fixed-decimal with trailing zeros stripped.
  const numeric = /e/i.test(precise)
    ? cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
    : parseFloat(precise).toString();
  return `$${numeric}`;
}
