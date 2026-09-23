import type { AgentStats } from "@devdigest/shared/contracts/observability";

/** Local, one-off formatters (same shape as `/agent-performance`'s own
 *  `AgentPerfView/helpers.ts` — a 3-line duplicate is cheaper than a shared
 *  module for this size of function; see client/LEARNINGS.md's "three
 *  copies before extracting" precedent). */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatAcceptRate(rate: number | null, na: string): string {
  if (rate == null) return na;
  return `${Math.round(rate * 100)}%`;
}

/** AC-1/AC brief — the same "78% (110/142)" denominator shape the dashboard
 *  table shows, so a side-by-side comparison is literal. */
export function acceptRateWithDenominator(stats: AgentStats, na: string): string {
  const pct = formatAcceptRate(stats.accept_rate, na);
  return stats.decisions > 0 ? `${pct} (${stats.accepted}/${stats.decisions})` : pct;
}
