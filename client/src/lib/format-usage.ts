/**
 * Shared formatting for LLM run usage (cost + tokens). ONE rule for every
 * surface that shows a run/PR cost — PR list, timeline, run drawer, review
 * accordion, verdict banner — instead of the design's per-screen formats.
 */

/** Smallest cost shown as a number; anything below reads "<$0.0001". */
const USD_FLOOR = 0.0001;

/**
 * Compact USD cost.
 * - null/undefined → "—" (unknown: unpriced model or a run before cost tracking)
 * - 0 → "$0.00"; below $0.0001 → "<$0.0001"
 * - under $1 → 2 significant digits, trailing zeros trimmed down to 2 decimals
 *   ($0.0013, $0.014, $0.06, $0.10)
 * - $1 and above → 2 decimals ($1.23)
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  if (usd < USD_FLOOR) return `<$${USD_FLOOR}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const decimals = Math.max(2, 1 - Math.floor(Math.log10(usd)));
  const [int, frac = ""] = usd.toFixed(decimals).split(".");
  return `$${int}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}

/** Full-precision USD for tooltips (e.g. "$0.001312"); "" when unknown. */
export function formatUsdExact(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "";
  return `$${usd.toFixed(6)}`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
