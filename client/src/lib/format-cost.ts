/** Run cost / token formatting shared by the PR list, run timeline, verdict and trace drawer. */

/** Placeholder for "no data" — an unpriced run is NOT free, so never "$0.00". */
export const NO_COST = "—";

/**
 * USD → compact string. null/undefined/NaN → "—"; real 0 → "$0.00";
 * <$0.01 → 4 decimals ($0.0013); <$1 → 3 decimals ($0.014); else 2 ($1.25).
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_COST;
  if (usd === 0) return "$0.00";
  // A priced run is never shown as free: sub-0.0001 collapses to "<$0.0001".
  if (usd > 0 && usd < 0.0001) return "<$0.0001";
  // Pick the bracket from the value AFTER rounding, so 0.9996 → "$1.00", not "$1.000".
  if (Number(usd.toFixed(4)) < 0.01) return `$${usd.toFixed(4)}`;
  if (Number(usd.toFixed(3)) < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** 8200 → "8.2K", 950 → "950", 1_500_000 → "1.5M". */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** "8.2K→1.3K". */
export function formatTokensInOut(tokensIn: number, tokensOut: number): string {
  return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
}
