/* hooks/intent.ts — the Intent card's data path: GET the stored intent (no
   model call), POST to (re)derive one. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

/** The PR's stored intent, or `{ intent: null }` before it is ever derived.
    `staleTime: 0` so remounting the card (leaving and returning to Overview)
    always refetches — no page-level invalidation needed after a review runs
    a fresh derivation server-side. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    staleTime: 0,
  });
}

/** Derive / re-derive — a paid model call, rate-limited server-side. */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent/derive`),
    onSuccess: (data) => qc.setQueryData(["pr-intent", prId], data),
  });
}
