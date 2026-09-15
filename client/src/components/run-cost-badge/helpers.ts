/** Placeholder for "no data" — a run without a known cost never reads "$0.00". */
export const NO_DATA = "—";

/**
 * Run cost in USD for display.
 * - null / non-finite → "—" (no data)
 * - exactly 0 → "$0" (free model: real data, not missing data)
 * - < $1 → 4 decimals with trailing zeros trimmed ($0.0013, $0.014, $0.1)
 * - ≥ $1 → 2 decimals ($1.24)
 * - nonzero but rounds to 0 at 4 decimals → "<$0.0001"
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_DATA;
  if (usd === 0) return "$0";
  const fixed4 = usd.toFixed(4);
  if (Number(fixed4) >= 1) return `$${usd.toFixed(2)}`;
  const trimmed = fixed4.replace(/\.?0+$/, "");
  if (Number(trimmed) === 0) return "<$0.0001";
  return `$${trimmed}`;
}

/** Compact token count: 950 → "950", 8200 → "8.2K". */
export function formatTokensK(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}K`;
}
