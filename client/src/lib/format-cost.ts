/**
 * Cost + token formatting for the Cost badge (PR list, Agent runs card, run drawer).
 *
 * Cost is derived from provider usage. `null` means "no usage data" or "model
 * has no price" and renders as "-" — never "$0.00" (that would claim a cost we
 * do not know). A real zero from a free model still renders as a number.
 *
 * Precision is adaptive so tiny per-run costs stay readable:
 *   < $0.01 → 4 decimals ($0.0013), < $1 → 3 decimals ($0.014), else 2 ($1.25).
 */
export const NO_COST = "-";

export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_COST;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Thousands-separated token count, e.g. 9119 → "9,119". Fixed locale for stable output. */
export function formatTokenCount(n: number): string {
  return n.toLocaleString("en-US");
}
