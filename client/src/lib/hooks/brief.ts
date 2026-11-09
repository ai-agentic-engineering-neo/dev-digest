/* hooks/brief.ts — PR Why + Risk brief: read (polled while a generation is in flight) and generate.
   The generate result is written into the cache BEFORE invalidating. The card shows its own error,
   so the global mutation toast is skipped (OWN_ERROR_TOAST). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { OWN_ERROR_TOAST } from "../error-message";
import type { PrBriefResponse } from "../types";

export const prBriefKey = (prId: string) => ["pr-brief", prId] as const;

/** How often the brief is re-read while a generation is in flight (AC-19). */
export const BRIEF_POLL_MS = 3000;

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBriefKey(prId ?? ""),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.generating ? BRIEF_POLL_MS : false),
  });
}

export function useGenerateBrief(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    meta: OWN_ERROR_TOAST,
    onMutate: () => {
      qc.setQueryData<PrBriefResponse>(prBriefKey(prId), (d) => (d ? { ...d, generating: true } : d));
    },
    onSuccess: (result) => {
      qc.setQueryData<PrBriefResponse>(prBriefKey(prId), result);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) {
        qc.invalidateQueries({ queryKey: ["pull", prId] });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: prBriefKey(prId) }),
  });
}
