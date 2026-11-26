/**
 * M1 cost badge — formatting for run cost (USD) and token totals.
 * Shared by the PR list COST column, the Agent-runs timeline and the run
 * drawer's COST tile. Missing data renders as "—", never "$0.00".
 */

export const NO_VALUE = "—";

const intFmt = new Intl.NumberFormat("en-US");

/**
 * `$0.0013` (< 1¢ → 4 decimals) · `$0.014` (< $1 → 3) · `$1.24` (≥ $1 → 2).
 * null/undefined/non-finite → "—". A genuine 0 (free model) → "$0.00".
 */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NO_VALUE;
  if (n === 0) return "$0.00";
  const digits = n < 0.01 ? 4 : n < 1 ? 3 : 2;
  return `$${n.toFixed(digits)}`;
}

/** Full-precision USD for tooltips: `$0.001284`. */
export function formatUsdPrecise(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NO_VALUE;
  return `$${Number(n.toPrecision(4))}`;
}

/** Comma-grouped integer: 9119 → "9,119". */
export function formatInt(n: number): string {
  return intFmt.format(n);
}

/**
 * Total tokens (in + out), comma-grouped: "9,119". Returns null when there is
 * no token data (both null, or 0 — failed runs persist 0/0).
 */
export function formatTokenTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  return total > 0 ? formatInt(total) : null;
}
