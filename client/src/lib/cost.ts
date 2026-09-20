/**
 * Dollar cost of a review run, shared by the PR list, the run timeline and the
 * run-trace drawer.
 *
 * A typical run costs cents or fractions of a cent, so two decimals would round
 * most of them to "$0.00" — under a dollar we show four, the same "more digits
 * when the number is small" idea as the per-1M price labels in `model-label.ts`.
 * Cost is null on failed runs and on models with no known pricing; that is "we
 * do not know", not "free", so it reads as an em dash rather than a zero.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  return usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
