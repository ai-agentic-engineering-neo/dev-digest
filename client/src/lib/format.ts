/**
 * Shared number-formatting helpers for run/PR cost + token usage — used by the
 * PR list COST column, the Agent runs timeline, and the trace drawer's Stats
 * row, so the same run reads identically on every surface.
 */

/**
 * USD cost, e.g. `$0.0600`, `$0.0004`, `$1.23`. `null`/`undefined` (unknown —
 * no completed run yet, or an unpriced model) renders as "—", which is a
 * different fact from a genuinely free run (`0` → `$0.0000`). Below $1, a
 * plain two-decimal format would round almost every run here to `$0.00`
 * (real per-run costs run a few tenths of a cent), so small values keep
 * enough significant digits to show a nonzero figure instead.
 *
 * `minDecimals` defaults to 4, not 2: a run rounded to 2 decimals on the
 * Timeline (e.g. a true $0.0067 shown as "$0.01") no longer matches the sum
 * shown on the PR list, which looks like a math error even though the
 * underlying total is correct — every surface must use the same floor so a
 * run reads identically (and sums add up when eyeballed) everywhere. Pass a
 * lower `minDecimals` only for a context where less precision is genuinely
 * fine; it still grows past the floor if that many decimals would round to
 * zero.
 */
export function formatCost(usd: number | null | undefined, minDecimals = 4): string {
  if (usd == null) return "—";
  if (usd === 0) return `$${(0).toFixed(minDecimals)}`;
  if (Math.abs(usd) >= 1) return `$${usd.toFixed(Math.max(2, minDecimals))}`;
  let decimals = minDecimals;
  while (decimals < 6 && Number(usd.toFixed(decimals)) === 0) decimals++;
  return `$${usd.toFixed(decimals)}`;
}

/**
 * Total token count (in + out combined) as a single abbreviated number, e.g.
 * `12k`, `13.5k`, `850` — a single figure reads as a specific count, not a
 * range, which an "in→out" pair looked like at a glance.
 */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  const total = tokensIn + tokensOut;
  if (total < 1000) return `${total}`;
  return `${Number((total / 1000).toFixed(1))}k`;
}
