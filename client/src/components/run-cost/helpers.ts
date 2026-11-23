/** Formatting for per-run cost and token totals (shared by PR list, timeline, trace). */

/**
 * USD cost: missing → "—" (never "$0.00"); < $1 → 2 significant digits
 * ($0.0013, $0.014, $0.06); ≥ $1 → 2 decimals ($1.24).
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return "—";
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd < 0.0001) return "<$0.0001";
  return `$${Number(usd.toPrecision(2))}`;
}

/** Total tokens (in + out) with a thousands separator, e.g. "9,119"; null when unknown or zero. */
export function formatTokenTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  return total > 0 ? total.toLocaleString("en-US") : null;
}
