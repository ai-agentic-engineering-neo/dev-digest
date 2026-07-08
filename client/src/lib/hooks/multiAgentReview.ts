/* hooks/multiAgentReview.ts — trigger + fetch a multi-agent review run.
   Pairs with contracts/observability.ts (MultiAgentRunRequest / Result / MultiAgentRun). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  MultiAgentRun,
  MultiAgentRunLatest,
  MultiAgentRunRequest,
  MultiAgentRunTriggerResult,
} from "@devdigest/shared";

/** Fan a review out to several agents at once. POST /pulls/:id/multi-agent-run. */
export function useTriggerMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) =>
      api.post<MultiAgentRunTriggerResult>(`/pulls/${prId}/multi-agent-run`, {
        agent_ids: agentIds,
      } satisfies MultiAgentRunRequest),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent-run", prId] });
      qc.invalidateQueries({ queryKey: ["multi-agent-latest"] });
    },
  });
}

/**
 * The most recent multi-agent run across the workspace (any PR), or null when
 * none exist. The GLOBAL "Multi-Agent Review" nav has no PR context, so this
 * lets the landing page reopen the last run instead of the configure form.
 * GET /multi-agent/latest. Pass `{ enabled: false }` to skip the fetch (e.g.
 * when the user explicitly asked to start a new review).
 */
export function useLatestMultiAgentRun(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["multi-agent-latest"],
    queryFn: () => api.get<MultiAgentRunLatest>("/multi-agent/latest"),
    enabled: opts?.enabled ?? true,
    staleTime: 0,
  });
}

/**
 * The most recent multi-agent run for ONE PR (or null when none exist). Returns
 * 200-null rather than 404, so the PR-detail page can gate a "view multi-agent
 * run" link without console errors. GET /pulls/:id/multi-agent/latest.
 */
export function usePrLatestMultiAgentRun(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-latest", "pr", prId],
    queryFn: () => api.get<MultiAgentRunLatest>(`/pulls/${prId}/multi-agent/latest`),
    enabled: !!prId,
  });
}

/**
 * Fetch a multi-agent run for a PR. When `multiRunId` is omitted the server
 * returns the most recent one. GET /pulls/:id/multi-agent.
 */
export function useMultiAgentRun(
  prId: string | null | undefined,
  multiRunId?: string | null,
) {
  return useQuery({
    queryKey: ["multi-agent-run", prId, multiRunId ?? null],
    queryFn: () =>
      api.get<MultiAgentRun>(
        `/pulls/${prId}/multi-agent${multiRunId ? `?multiRunId=${multiRunId}` : ""}`,
      ),
    enabled: !!prId,
  });
}
