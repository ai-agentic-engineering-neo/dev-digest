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

/**
 * Coarse relative-time label ("now" / "3m" / "2h" / "5d"). Promoted here from
 * two near-identical colocated copies (`pulls/helpers.ts`,
 * `tour/_components/OnboardingTourView/helpers.ts`) once a third real
 * consumer (`PrBriefCard`'s provenance line) arrived — see
 * `client/LEARNINGS.md`'s "colocate, promote on the second/third use".
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
