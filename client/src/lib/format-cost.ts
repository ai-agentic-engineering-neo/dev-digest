/**
 * Run-cost formatting shared by the PR list, the run timeline and the trace
 * drawer. An unknown cost (null/undefined — failed run, unpriced model, legacy
 * row) renders "—", never "$0.00": zero would read as "free", which it wasn't.
 */

/** USD with precision scaled to magnitude: $0.0013 · $0.014 · $1.20. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  const digits = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `$${usd.toFixed(digits)}`;
}

/** Grouped token count: 9119 → "9,119". */
export function formatTokenCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
