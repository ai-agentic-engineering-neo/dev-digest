/**
 * Run cost / token formatters (M1 — run cost badge).
 *
 * `null`/`undefined` cost means "no data" (running, failed, cancelled, pre-M1
 * run, or unknown model price) and renders as an em dash — never "$0.00".
 * A real `0` (free model) renders as "$0.00".
 */

export const NO_DATA = "—";

/** USD with precision scaled to magnitude: $0.0013 · $0.014 · $1.25. */
export function formatUsd(cost: number | null | undefined): string {
  if (cost == null || !Number.isFinite(cost)) return NO_DATA;
  if (cost === 0) return "$0.00";
  const decimals = cost < 0.01 ? 4 : cost < 1 ? 3 : 2;
  return `$${cost.toFixed(decimals)}`;
}

/** One decimal, trailing ".0" dropped: 12.0 → "12", 8.2 → "8.2". */
function oneDecimal(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** One token count in compact K/M form: 950 · 8.2K · 12K · 1.3M. */
function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${oneDecimal(n / 1_000_000)}M`;
  if (n >= 1_000) return `${oneDecimal(n / 1_000)}K`;
  return String(n);
}

/** Input→output tokens, compact: "8.2K→1.3K". */
export function formatTokensK(tokensIn: number, tokensOut: number): string {
  return `${compactTokens(tokensIn)}→${compactTokens(tokensOut)}`;
}

/** Total tokens with space-grouped thousands: 9119 → "9 119". */
export function formatTokenTotal(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
