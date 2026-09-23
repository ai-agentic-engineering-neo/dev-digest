import type { AgentPerfRow } from "@devdigest/shared/contracts/productionize";
import type { SortDir, SortField } from "./constants";

/** AC-42 — sortable by accept-rate (also by runs / cost). Nulls (AC-46's
 *  not-applicable accept rate) sort last regardless of direction, so an
 *  ascending sort never puts a CI-only agent first by accident.
 *  specs/16-agent-performance-dashboard.md clarification #2 — an accept-rate
 *  sort ALSO tiers low-sample agents (< 20 decisions) last regardless of
 *  direction, reusing the same null-sorts-last mechanism (D3: this is also
 *  where the previously-dead `total_cost_usd` sort field gets exercised). */
export function sortAgents(rows: AgentPerfRow[], field: SortField, dir: SortDir): AgentPerfRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (field === "accept_rate" && a.low_sample !== b.low_sample) {
      return a.low_sample ? 1 : -1;
    }
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

/** AC brief — "show the accept-rate denominator and run count for the
 *  selected period": renders "78% (110/142)" rather than a bare percentage. */
export function acceptRateWithDenominator(row: AgentPerfRow, na: string): string {
  const pct = formatAcceptRate(row.accept_rate, na);
  return row.decisions > 0 ? `${pct} (${row.accepted}/${row.decisions})` : pct;
}

/** Sum per-agent `trend` arrays index-wise into one workspace-level per-day
 *  run count — every row's trend covers the SAME [from,to) window (one entry
 *  per day, server-bucketed), so the arrays are always the same length. */
export function totalTrend(rows: AgentPerfRow[]): number[] {
  if (rows.length === 0) return [];
  const len = rows[0]!.trend.length;
  const out = new Array(len).fill(0) as number[];
  for (const r of rows) {
    for (let i = 0; i < len; i++) out[i] = (out[i] ?? 0) + (r.trend[i] ?? 0);
  }
  return out;
}

/** Sum only the agents that HAVE a known cost delta — partial-but-honest
 *  rather than a fabricated 0 for agents with no prior-period data. `null`
 *  when NO agent has a known delta (nothing to compare workspace cost to). */
export function totalCostDelta(rows: AgentPerfRow[]): number | null {
  const known = rows.filter((r): r is AgentPerfRow & { cost_delta: number } => r.cost_delta != null);
  if (known.length === 0) return null;
  return known.reduce((sum, r) => sum + r.cost_delta, 0);
}

/** AC-7 — the workspace-level cost-provenance split (the "$6.10 reconciled ·
 *  $2.64 estimated" line), summed from every agent's own `cost_by_source`.
 *  Each bucket stays `null` (not a fabricated $0.00) until at least one
 *  agent contributes to it — null-is-not-zero. */
export function totalCostBySource(rows: AgentPerfRow[]): { provider: number | null; estimated: number | null; unknown: number | null } {
  let provider: number | null = null;
  let estimated: number | null = null;
  let unknown: number | null = null;
  for (const r of rows) {
    if (r.cost_by_source.provider != null) provider = (provider ?? 0) + r.cost_by_source.provider;
    if (r.cost_by_source.estimated != null) estimated = (estimated ?? 0) + r.cost_by_source.estimated;
    if (r.cost_by_source.unknown != null) unknown = (unknown ?? 0) + r.cost_by_source.unknown;
  }
  return { provider, estimated, unknown };
}
