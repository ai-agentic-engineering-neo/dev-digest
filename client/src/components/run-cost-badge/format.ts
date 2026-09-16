/**
 * Format a run's USD cost for compact display.
 *
 * `null`/`undefined` means "no usage/pricing data" (failed run, cancelled
 * run, or a model with no known price) and must render as "—", never
 * "$0.00" — a real $0 (e.g. a free model) is legitimate data and IS shown
 * as "$0.00".
 */
export function formatRunCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  const abs = Math.abs(usd);
  if (abs < 0.0001) return "<$0.0001";
  if (abs < 0.01) return `$${usd.toFixed(4)}`;
  if (abs < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** "9,119 tok" — combined in+out token count, thousands-separated. */
export function formatTokenCount(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn + tokensOut).toLocaleString()} tok`;
}
