/* hooks/agent-performance.ts — React Query hooks for the Agent Performance
   dashboard (`GET /agents/performance`) and the per-agent Stats tab
   (`GET /agents/:id/stats`), specs/14-export-to-ci.md AC-40…AC-46 and
   specs/16-agent-performance-dashboard.md. Both endpoints share the same
   range querystring shape, so `PerfRangeValue` and `rangeQuery` are the ONE
   place that shape is expressed client-side — the same period selector
   (`PerfRangePicker`) drives both. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerf } from "@devdigest/shared/contracts/productionize";
import type { AgentStats } from "@devdigest/shared/contracts/observability";

/** A fixed preset (1/7/30/90 days) or a custom `[from, to]` ISO datetime
 *  pair (specs/16 clarification #5). */
export type PerfRangeValue = { days: number } | { from: string; to: string };

export function isCustomPerfRange(v: PerfRangeValue): v is { from: string; to: string } {
  return "from" in v;
}

function rangeQuery(range: PerfRangeValue): string {
  return isCustomPerfRange(range)
    ? `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    : `range_days=${range.days}`;
}

export const agentPerfKeys = {
  perf: (range: PerfRangeValue) => ["agent-performance", range] as const,
  stats: (agentId: string | null | undefined, range: PerfRangeValue) =>
    ["agent-stats", agentId, range] as const,
};

/** GET /agents/performance — stored-rows aggregation only (AC-25/AC-6). */
export function useAgentPerformance(range: PerfRangeValue) {
  return useQuery({
    queryKey: agentPerfKeys.perf(range),
    queryFn: () => api.get<AgentPerf>(`/agents/performance?${rangeQuery(range)}`),
  });
}

/** GET /agents/:id/stats — the per-agent Stats tab, same query + rules as
 *  the dashboard (AC-1). */
export function useAgentStats(agentId: string | null | undefined, range: PerfRangeValue) {
  return useQuery({
    queryKey: agentPerfKeys.stats(agentId, range),
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats?${rangeQuery(range)}`),
    enabled: !!agentId,
  });
}
