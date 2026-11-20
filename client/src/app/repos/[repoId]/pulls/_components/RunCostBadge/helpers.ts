const UNDER_ONE_DOLLAR = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 3,
});
const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * USD cost for display. Null/undefined = unknown → "—", never a fake "$0.00".
 * Sub-dollar amounts keep 3 significant digits ($0.0013, $0.0123) so cheap runs
 * stay readable; a real 0 (free model) is "$0".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return usd >= 1 ? DOLLARS.format(usd) : UNDER_ONE_DOLLAR.format(usd);
}
