/* hooks/agent-performance.ts — React Query hook for the Agent Performance
   page (specs/14-export-to-ci.md AC-40…AC-46). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerf } from "@devdigest/shared/contracts/productionize";

export const agentPerfKeys = {
  perf: (rangeDays: number) => ["agent-performance", rangeDays] as const,
};

/** GET /agents/performance — stored-rows aggregation only (AC-25). */
export function useAgentPerformance(rangeDays: number) {
  return useQuery({
    queryKey: agentPerfKeys.perf(rangeDays),
    queryFn: () => api.get<AgentPerf>(`/agents/performance?range_days=${rangeDays}`),
  });
}
