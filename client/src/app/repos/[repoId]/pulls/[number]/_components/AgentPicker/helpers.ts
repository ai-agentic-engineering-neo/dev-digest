/* Pure formatting helpers for AgentPicker. Kept out of the component body per
   the "derivations belong in helpers.ts" convention (frontend-architecture). */

/** "8.2s" — one decimal place, matches the spec's estimate summary format. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** "$0.20" — two decimal places, matches RunCostBadge's precision convention. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
