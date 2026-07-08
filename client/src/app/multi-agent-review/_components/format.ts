/* Pure formatting helpers shared across Multi-Agent Review components.
   Mirrors the PR-page AgentPicker's formatting convention ("8.2s", "$0.20")
   so estimates/durations read consistently across the app; kept as our own
   copy since that file lives outside this track's owned paths. */

/** "8.2s" — one decimal place. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** "$0.20" — two decimal places. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
