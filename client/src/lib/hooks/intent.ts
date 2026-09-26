/* hooks/intent.ts — React Query hooks for the PR intent layer
   (GET /pulls/:id/intent, POST /pulls/:id/intent/recompute). Query key in
   keys.ts; the recompute mutation writes its result straight into the cache. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";
import { keys } from "./keys";

/** `null` = no intent derived yet for this PR. `staleTime: 0` so the Overview tab
    refetches after a review run has derived a new intent in the background. */
export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: keys.intent(prId),
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    staleTime: 0,
  });
}

export function useRecomputeIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    // Body-less POST: apiFetch must not declare a JSON content-type for it.
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/recompute`),
    onSuccess: (data) => qc.setQueryData(keys.intent(prId), data),
  });
}
