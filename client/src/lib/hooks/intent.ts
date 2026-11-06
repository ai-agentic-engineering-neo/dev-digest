/* hooks/intent.ts — derived PR intent: read, re-derive, save a user override, reset.
   Every mutation writes the returned entity into the cache BEFORE invalidating, so the card
   updates without a reload. Failures are toasted by the global MutationCache handler. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { IntentOverrideInput, PrIntent } from "../types";

export const prIntentKey = (prId: string) => ["pr-intent", prId] as const;

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntent | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

function useWriteIntentCache(prId: string) {
  const qc = useQueryClient();
  return (res: PrIntent | null) => {
    qc.setQueryData<PrIntent | null>(prIntentKey(prId), res);
    qc.invalidateQueries({ queryKey: prIntentKey(prId) });
  };
}

export function useRefreshIntent(prId: string) {
  const write = useWriteIntentCache(prId);
  return useMutation({
    mutationFn: () => api.post<PrIntent>(`/pulls/${prId}/intent/refresh`),
    onSuccess: write,
  });
}

export function useSaveIntentOverride(prId: string) {
  const write = useWriteIntentCache(prId);
  return useMutation({
    mutationFn: (input: IntentOverrideInput) => api.put<PrIntent>(`/pulls/${prId}/intent`, input),
    onSuccess: write,
  });
}

export function useResetIntent(prId: string) {
  const write = useWriteIntentCache(prId);
  return useMutation({
    mutationFn: () => api.del<PrIntent | null>(`/pulls/${prId}/intent`),
    onSuccess: write,
  });
}
