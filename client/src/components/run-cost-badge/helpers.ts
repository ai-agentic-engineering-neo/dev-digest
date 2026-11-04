/* Pure formatters for run cost / token usage (Run Cost Badge). */
import { COST_SMALL_THRESHOLD, NO_DATA } from "./constants";

/**
 * USD → display string. Unknown (null/undefined/NaN) → "—", never "$0.00":
 * a missing price must not read as "free". Sub-cent costs get 4 decimals so
 * a typical review ($0.0013) doesn't round to $0.001; otherwise 3 decimals.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_DATA;
  if (usd > 0 && usd < COST_SMALL_THRESHOLD) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

/** Total tokens (in + out), thousands-separated ("9,119"); null when both unknown. */
export function formatTokenTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  return ((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString("en-US");
}
