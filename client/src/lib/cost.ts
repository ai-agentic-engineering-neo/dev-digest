/** `null` = unpriced → "—"; a real 0 (free model) → "$0.00". Kept distinct on purpose:
 *  "—" means "we don't know", "$0.00" means "we know it was free". */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";

  const decimals = usd >= 1 ? 2 : Math.floor(-Math.log10(usd)) + 2;
  const [int, frac = ""] = usd.toFixed(decimals).split(".");
  return `$${int}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}
