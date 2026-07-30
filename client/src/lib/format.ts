/** Shared display formatters for run cost + token usage (PR list, verdict
    banner, run trace — all three must read identically). */

/**
 * Run cost in USD. `null`/`undefined` = no completed run / unknown pricing →
 * "—", which must stay distinguishable from a genuine $0 run ("$0.00").
 *
 * Sub-dollar costs keep 3 significant digits rather than a fixed decimal
 * count: real runs land around $0.0004–$0.02, so a flat toFixed(2) would
 * render nearly all of them as "$0.00".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  const abs = Math.abs(usd);
  if (abs === 0) return "$0.00";
  if (abs >= 1) return `$${usd.toFixed(2)}`;
  const sig = usd.toPrecision(3);
  const trimmed = sig.includes(".") ? sig.replace(/0+$/, "") : sig;
  const decimals = trimmed.split(".")[1] ?? "";
  return `$${decimals.length < 2 ? Number(trimmed).toFixed(2) : trimmed}`;
}

/** Token in→out summary, e.g. "8.2K→1.3K". */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  const k = (n: number) => `${(n / 1000).toFixed(1)}K`;
  return `${k(tokensIn)}→${k(tokensOut)}`;
}
