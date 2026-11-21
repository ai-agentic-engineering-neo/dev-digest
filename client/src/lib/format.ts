/**
 * Shared number formatters (M1 run cost). Pure — no React, no i18n: the only
 * characters they emit are digits, `$`, `,`, `<`, `→` and the `—` placeholder.
 */

/** Placeholder for "no data" (unknown cost, never-run PR). */
export const NO_VALUE = "—";

const grouped2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Compact USD for badges:
 *   null/undefined → "—" · 0 → "$0.00" · < 0.0001 → "<$0.0001"
 *   < 1 → 2 significant digits, at least 2 decimals ("$0.0013", "$0.014", "$0.06")
 *   ≥ 1 → 2 decimals, grouped ("$12.50", "$1,204.10")
 */
export function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NO_VALUE;
  if (v === 0) return "$0.00";
  if (v < 0.0001) return "<$0.0001";
  if (v >= 1) return `$${grouped2.format(v)}`;
  // Round to 2 significant digits (0.0999 → 0.1 carries into the next magnitude).
  const rounded = Number(v.toPrecision(2));
  if (rounded >= 1) return `$${grouped2.format(rounded)}`;
  // Decimals needed for those digits, never fewer than 2; drop trailing zeros
  // beyond the 2nd decimal ("$0.06", not "$0.060").
  const decimals = Math.max(2, 1 - Math.floor(Math.log10(rounded)));
  return `$${rounded.toFixed(decimals).replace(/(\.\d\d\d*?)0+$/, "$1")}`;
}

/** Exact USD for tooltips: 6 decimals ("$0.001284"); "—" when unknown. */
export function formatUsdExact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NO_VALUE;
  return `$${v.toFixed(6)}`;
}

const grouped0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Grouped integer token count ("9,119"). */
export function formatTokenCount(n: number): string {
  return grouped0.format(n);
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
