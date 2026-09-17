/** Shared number formatters — cost and token display used across the PR
 *  list, run timeline, trace drawer, and verdict banner. */

/**
 * USD cost, significant-digit based. Real run costs are $0.0004–$0.02;
 * `toFixed(2)` collapses nearly all of them to "$0.00", so this formats by
 * significant digits instead — `< 1` gets 3 significant digits (min 2
 * decimals), `>= 1` gets the usual 2 decimals. `null`/`undefined` → "—"
 * (unknown, not free); a genuinely free run is "$0.00".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  if (Math.abs(usd) < 1) {
    let str = usd.toPrecision(3);
    if (str.includes("e")) str = usd.toFixed(6);
    if (str.includes(".")) {
      str = str.replace(/0+$/, "").replace(/\.$/, "");
      const decimals = str.split(".")[1]?.length ?? 0;
      if (decimals < 2) str = usd.toFixed(2);
    }
    return `$${str}`;
  }
  return `$${usd.toFixed(2)}`;
}

/** "9,119" — thousands-separated token total. */
export function formatTokenCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
