/**
 * Shared number formatting for run cost + token counts.
 *
 * Cost precision scales with the amount: sub-cent run costs would read as
 * "$0.00" at two decimals, which is exactly the number we must never show for a
 * run that did cost something. `null`/`undefined` means NO DATA (failed run or
 * a model missing from the price book) and renders as an em dash — a genuine
 * zero (free model) still renders as "$0.00".
 */

export const NO_DATA = "—";

export function formatCost(usd: number | null | undefined): string {
  if (usd == null || Number.isNaN(usd)) return NO_DATA;
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  // 3 decimals keeps tenths of a cent visible ($0.014), but a trailing zero
  // adds nothing — "$0.06" reads better than "$0.060".
  if (usd < 1) return `$${usd.toFixed(3).replace(/0$/, "")}`;
  return `$${usd.toFixed(2)}`;
}

/** Compact token count: 820 → "820", 8_200 → "8.2K", 1_240_000 → "1.2M". */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** Prompt → completion token summary, e.g. "8.2K→1.3K". */
export function formatTokenFlow(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null || tokensOut == null) return null;
  return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
}
