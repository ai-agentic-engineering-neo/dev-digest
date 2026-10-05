/** Formatting for run cost / token usage. `--` means "no data" and is never `$0.00`. */
export const NO_DATA = "--";

/** USD for a run. >= $1: cents; $0.01-$1: 3 decimals ($0.012); below that 2
 *  significant digits ($0.0013) so a real small cost never rounds to $0.00;
 *  below $0.0001: "<$0.0001". A real 0 (free model) is "$0.000". */
export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return NO_DATA;
  if (usd === 0) return "$0.000";
  if (Number(usd.toFixed(3)) >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  if (usd >= 0.0001) return `$${usd.toPrecision(2)}`;
  return "<$0.0001";
}

/** Compact token count: 950 → "950", 8200 → "8.2K", 1_250_000 → "1.3M". */
export function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return NO_DATA;
  if (n >= 999_950) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}
