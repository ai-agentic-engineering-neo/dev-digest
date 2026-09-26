/**
 * Display formatting shared across subtrees.
 *
 * Lives in `lib/` rather than next to a component because the same cost format
 * is read on three unrelated screens: the PR list row, the run timeline and the
 * run trace drawer. A per-component helper would drift between them.
 */

/**
 * Shown when a number is unknown. Deliberately NOT "$0.00": a run whose model
 * has no price, or that died before the call, costs an *unknown* amount — "$0"
 * would claim it was free.
 */
export const NO_DATA = "—";

/**
 * A USD amount at up to 2 significant digits, minimum 2 decimal places, with
 * trailing zeros trimmed back to that 2-decimal floor.
 *
 *   0.0135  -> "$0.014"      0.0601 -> "$0.06"
 *   0.00131 -> "$0.0013"     12.345 -> "$12.35"
 *
 * `null`/`undefined` render as an em dash; an exact 0 renders "$0", which is a
 * real answer (some models are free) and distinct from "no data".
 *
 * Note the scale-then-round instead of a bare `toFixed`: `(0.0135).toFixed(3)`
 * is "0.013", because 0.0135 is stored as 0.013499…. `Intl.NumberFormat` with
 * `maximumSignificantDigits` avoids that too, but it then ignores
 * `minimumFractionDigits`, turning 12.345 into "$12" — so it is not usable here.
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null) return NO_DATA;
  if (usd === 0) return "$0";
  const decimals = Math.max(2, 1 - Math.floor(Math.log10(Math.abs(usd))));
  const factor = 10 ** decimals;
  let s = (Math.round(usd * factor) / factor).toFixed(decimals);
  while (s.includes(".") && s.endsWith("0") && s.split(".")[1]!.length > 2) {
    s = s.slice(0, -1);
  }
  return `$${s}`;
}

/** A single token count with thousands separators, e.g. 9119 -> "9,119". */
export function formatTokenCount(n: number | null | undefined): string {
  return n == null ? NO_DATA : n.toLocaleString("en-US");
}
