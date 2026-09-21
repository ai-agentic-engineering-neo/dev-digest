import type { AgentPerfRow } from "@devdigest/shared/contracts/productionize";
import type { SortDir, SortField } from "./constants";

/** AC-42 — sortable by accept-rate (also by runs / cost). Nulls (AC-46's
 *  not-applicable accept rate) sort last regardless of direction, so an
 *  ascending sort never puts a CI-only agent first by accident. */
export function sortAgents(rows: AgentPerfRow[], field: SortField, dir: SortDir): AgentPerfRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign;
  });
}

/** Duration formatter local to this page — `avg_latency_ms` only needs a
 *  coarse one-decimal-second label here, unlike the run-trace drawer's own
 *  `formatSeconds` (which that feature owns privately). */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatAcceptRate(rate: number | null, na: string): string {
  if (rate == null) return na;
  return `${Math.round(rate * 100)}%`;
}
