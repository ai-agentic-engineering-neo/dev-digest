/**
 * Format a USD review cost. "—" = unknown (null/unpriced model or the run
 * never completed an LLM call), "Free" = a known-zero-cost model, "<$0.001"
 * = nonzero but too small to show at 3dp (avoids reading as free), else
 * "$X.XXX".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "Free";
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}
