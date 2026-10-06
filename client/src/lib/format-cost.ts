/**
 * Run-cost formatting — the single place USD amounts are rendered
 * (spec: specs/run-cost-badge.md). Unknown cost is "—", never "$0.00".
 */

/** USD with ≥3 significant digits: 0.0013 → "$0.0013", 0.014 → "$0.014", 1.234 → "$1.23". */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  const rounded = Number(usd.toPrecision(3));
  return rounded >= 1 ? `$${usd.toFixed(2)}` : `$${rounded}`;
}

/** Token count with thousands separators: 9119 → "9,119". */
export function formatTokenCount(n: number): string {
  return n.toLocaleString("en-US");
}
