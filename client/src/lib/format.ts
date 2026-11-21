/** Shared number formatters for run usage (tokens / USD cost). */

/**
 * USD cost of a run. `null`/`undefined` means "unknown" → "—" (never "$0.00").
 * Sub-dollar values keep 3 decimals so cheap runs stay distinguishable ($0.014).
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/** Total tokens with thousands separators (e.g. "9,119"). */
export function formatTokenTotal(tokensIn: number, tokensOut: number): string {
  return (tokensIn + tokensOut).toLocaleString("en-US");
}
