/** Formats a run's USD cost. `null` covers every "no data" case in one place:
 *  never reviewed, an unpriced model, or a failed/cancelled run. */
export function formatCostUsd(costUsd: number | null | undefined): string {
  if (costUsd == null) return "—";
  if (costUsd > 0 && costUsd < 0.0005) return "<$0.001";
  return `$${costUsd.toFixed(3)}`;
}

/** Token in→out summary for the full badge (e.g. "8.2K→1.3K"). */
export function formatTokenPair(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string {
  if (tokensIn == null || tokensOut == null) return "—";
  const fmt = (n: number) => `${(n / 1000).toFixed(1)}K`;
  return `${fmt(tokensIn)}→${fmt(tokensOut)}`;
}
