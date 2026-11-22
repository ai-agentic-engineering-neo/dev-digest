/* Run-cost / token formatters for the M1 cost badge (PR list, timeline, run
   drawer, verdict banner). A missing value is UNKNOWN and renders "—", never
   "$0.00" — a real $0 (free model) is still shown as "$0.00". */

const DASH = "—";
/** Narrow no-break space: "9 119" thousands grouping that never wraps. */
const THIN = " ";

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * USD cost with 2 significant digits below $1 ("$0.014", "$0.0013", "$0.06"),
 * cents at/above $1 ("$1.27"). Tiny non-zero spend floors to "<$0.0001".
 */
export function formatCostUsd(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  if (v === 0) return "$0.00";
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v < 0.0001) return "<$0.0001";
  const sig = String(Number(v.toPrecision(2)));
  const decimals = sig.split(".")[1]?.length ?? 0;
  return `$${decimals < 2 ? v.toFixed(2) : sig}`;
}

/** Integer with thin-space thousands grouping ("9 119"). */
export function formatTokenCount(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

function kilo(n: number): string {
  return n < 1000 ? String(Math.round(n)) : `${(n / 1000).toFixed(1)}K`;
}

/** Token in→out summary in K ("8.2K→1.3K"); "—" when either side is unknown. */
export function formatTokensArrow(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string {
  if (!isNum(tokensIn) || !isNum(tokensOut)) return DASH;
  return `${kilo(tokensIn)}→${kilo(tokensOut)}`;
}
