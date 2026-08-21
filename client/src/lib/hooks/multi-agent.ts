/* hooks/multi-agent.ts — React Query hooks for specs/13-multi-agent-review.md.
   Read the latest multi-agent run for a PR, read per-agent historical
   estimates for the configure surface, and trigger a new multi-agent run. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
// Import from the contract module directly, not the bare `@devdigest/shared`
// barrel (client/LEARNINGS.md:316-361) — only the inferred TYPE is needed
// here, so `import type` erases entirely and never touches the barrel at all.
import type { MultiAgentRun, AgentRunEstimate } from "@devdigest/shared/contracts/observability";

export const multiAgentKeys = {
  run: (prId: string | null | undefined) => ["multi-agent-run", prId] as const,
  estimates: () => ["multi-agent-estimates"] as const,
};

/** The latest multi-agent run for a PR (GET /pulls/:id/multi-agent). Polls
   while any column is still running so per-agent progress self-updates
   (AC-45, AC-48); stops once every column has settled. */
export function useMultiAgentRun(prId: string | null | undefined) {
  return useQuery({
    queryKey: multiAgentKeys.run(prId),
    queryFn: () => api.get<MultiAgentRun>(`/pulls/${prId}/multi-agent`),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.status === "running") ? 4000 : false,
  });
}

/** Per-agent historical duration/cost averages (GET /multi-agent/estimates),
   for the configure surface's estimate (AC-5, AC-6). `null` fields mean "no
   completed run to derive from" — never rendered as 0 by a caller. */
export function useAgentRunEstimates() {
  return useQuery({
    queryKey: multiAgentKeys.estimates(),
    queryFn: () => api.get<AgentRunEstimate[]>(`/multi-agent/estimates`),
  });
}

/** Trigger a multi-agent run (POST /pulls/:id/multi-agent-run). Returns
   immediately with every column at status='running' (AC-13); an in-flight
   run on this PR is surfaced instead of started twice (AC-12). */
export function useStartMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) =>
      api.post<MultiAgentRun>(`/pulls/${prId}/multi-agent-run`, { agentIds }),
    // A GET already in flight (e.g. results surface polling) must not be
    // allowed to land after onSuccess and overwrite the just-started run.
    onMutate: async ({ prId }) => {
      await qc.cancelQueries({ queryKey: multiAgentKeys.run(prId) });
    },
    onSuccess: (data, { prId }) => {
      qc.setQueryData(multiAgentKeys.run(prId), data);
    },
  });
}
