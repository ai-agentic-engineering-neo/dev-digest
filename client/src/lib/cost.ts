const MAX_TO_FIXED_DIGITS = 20;

/** `null` = unpriced → "—"; a real 0 (free model) → "$0.00". Kept distinct on purpose:
 *  "—" means "we don't know", "$0.00" means "we know it was free". A value that
 *  cannot be a cost (negative, NaN, Infinity — all storable in float8) is "we
 *  don't know" too, because rendering it would state a price we never had. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return "—";
  if (usd === 0) return "$0.00";

  const wanted = usd >= 1 ? 2 : Math.floor(-Math.log10(usd)) + 2;
  const decimals = Math.min(wanted, MAX_TO_FIXED_DIGITS);
  const [int, frac = ""] = usd.toFixed(decimals).split(".");
  return `$${int}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}
