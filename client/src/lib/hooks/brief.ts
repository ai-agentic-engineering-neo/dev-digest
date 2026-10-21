/* hooks/brief.ts — React Query hooks for the PR Brief (Overview tab). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefView, RunSummary } from "@devdigest/shared";

const RUN_POLL_MS = 2_000;

export const prBriefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

/** Stored brief + newest review facts + latest brief run + stale flag; polls while a run is running. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBriefKey(prId),
    queryFn: () => api.get<PrBriefView>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? RUN_POLL_MS : false),
  });
}

/** Generate / Regenerate: starts a background run and returns the running run. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ run: RunSummary }>(`/pulls/${prId}/brief/generate`),
    onSuccess: ({ run }) => {
      // keep the previous brief visible while the new one is written
      qc.setQueryData<PrBriefView>(prBriefKey(prId), (old) => ({
        brief: old?.brief ?? null,
        review: old?.review ?? null,
        run,
        stale: old?.stale ?? false,
      }));
      qc.invalidateQueries({ queryKey: prBriefKey(prId) });
    },
  });
}
