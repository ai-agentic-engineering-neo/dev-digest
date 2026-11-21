/* Formatting for the M1 run cost badge. Kept pure so the trace drawer's COST
   tile and the badge share one definition of "readable cost". */

/** Placeholder for a run with no cost data — never "$0.00". */
export const NO_COST = "—";

/**
 * USD cost with at least 3 significant digits of signal:
 * - ≥ $0.01 → 3 decimals ("$0.012", "$1.250"; never "$0.01")
 * - < $0.01 → 2 significant digits ("$0.0013")
 * - exactly 0 (free model) → "$0.000"
 * - null / undefined / non-finite → "—"
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return NO_COST;
  if (usd === 0) return "$0.000";
  // Round to 2 significant digits first so 0.00999 lands on the ≥ $0.01 branch.
  const rounded = Number(usd.toPrecision(2));
  if (rounded >= 0.01) return `$${usd.toFixed(3)}`;
  const decimals = 1 - Math.floor(Math.log10(rounded));
  return `$${rounded.toFixed(decimals)}`;
}

/** Compact token count: 800 → "800", 8_200 → "8.2K", 15_000 → "15K", 1_250_000 → "1.3M". */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const [div, unit] = n < 1_000_000 ? [1000, "K"] : [1_000_000, "M"];
  return `${(n / div).toFixed(1).replace(/\.0$/, "")}${unit}`;
}

/** "8.2K→1.3K" token in→out summary. */
export function formatTokenPair(tokensIn: number, tokensOut: number): string {
  return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
}
