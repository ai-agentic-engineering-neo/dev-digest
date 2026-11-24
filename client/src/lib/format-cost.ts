/**
 * Format a USD run cost for display.
 * - null/undefined/NaN (unknown price, old run, still running) → "—" — never "$0.00".
 * - < $0.01 → 4 decimals ($0.0013); < $1 → 3 decimals ($0.014); otherwise 2 ($1.25).
 * A true zero renders as "$0.0000".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  const decimals = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `$${usd.toFixed(decimals)}`;
}
