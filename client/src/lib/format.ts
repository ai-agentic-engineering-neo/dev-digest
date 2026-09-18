/**
 * Shared number-formatting helpers for run/PR cost + token usage — used by the
 * PR list COST column, the Agent runs timeline, and the trace drawer's Stats
 * row, so the same run reads identically on every surface.
 */

/**
 * USD cost, e.g. `$0.06`, `$0.0004`, `$1.23`. `null`/`undefined` (unknown —
 * no completed run yet, or an unpriced model) renders as "—", which is a
 * different fact from a genuinely free run (`0` → `$0.00`). Below $1, a
 * plain two-decimal format would round almost every run here to `$0.00`
 * (real per-run costs run a few tenths of a cent), so small values keep
 * enough significant digits to show a nonzero figure instead.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  if (Math.abs(usd) >= 1) return `$${usd.toFixed(2)}`;
  // Start at 2 decimals; grow only as far as needed to clear a $0.00 rounding
  // (real per-run costs here can be a few hundredths of a cent).
  let decimals = 2;
  while (decimals < 6 && Number(usd.toFixed(decimals)) === 0) decimals++;
  return `$${usd.toFixed(decimals)}`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
