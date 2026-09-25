/* format-cost — number formatting for the Run Cost Badge (L01).
   Shared by the badge component and the run trace drawer's COST stat. */

/**
 * USD cost with adaptive precision:
 *   null / undefined / non-finite → "—"   (no data — never "$0.00")
 *   0                             → "$0.00" (a real price: free model)
 *   ≥ 0.10                        → two decimals        ($1.23, $0.10)
 *   < 0.10                        → two significant digits, trailing zeros
 *                                   trimmed, never fewer than two decimals
 *                                   ($0.06, $0.012, $0.0013, 0.00999 → $0.01)
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : "";
  if (abs >= 0.1) return `${sign}$${abs.toFixed(2)}`;
  let text = abs.toPrecision(2); // e.g. "0.0013", "0.012", "0.0100"
  if (text.includes("e")) text = Number(text).toFixed(20); // sub-1e-6 values
  const [whole, frac = ""] = text.split(".");
  let digits = frac.replace(/0+$/, "");
  if (digits.length < 2) digits = frac.slice(0, 2).padEnd(2, "0");
  return `${sign}$${whole}.${digits}`;
}

const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Thousands-separated integer token count (9119 → "9,119"). */
export function formatTokenTotal(n: number): string {
  return INT.format(Math.round(n));
}

/** Sum of in/out tokens, or null when neither side is known. */
export function totalTokens(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): number | null {
  if (tokensIn == null && tokensOut == null) return null;
  return (tokensIn ?? 0) + (tokensOut ?? 0);
}
