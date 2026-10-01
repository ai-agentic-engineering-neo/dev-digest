/* hooks/intent.ts — the derived PR intent (GET is a pure read; regenerate is a paid LLM call). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntent, PrIntentResponse } from "@devdigest/shared";

const key = (prId: string | null | undefined) => ["pr-intent", prId] as const;

/** The stored intent for a PR (null until derived) + whether the PR head moved since. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Force a fresh derivation; on success the cache is set directly (no refetch, not stale). */
export function useRegenerateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntent>(`/pulls/${prId}/intent/regenerate`),
    onSuccess: (intent) => {
      qc.setQueryData<PrIntentResponse>(key(prId), { intent, stale: false });
    },
  });
}
