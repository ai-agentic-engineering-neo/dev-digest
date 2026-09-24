/* hooks/intent.ts — the intent layer (server/specs/05-intent-layer.md):
   GET /pulls/:id/intent + POST /pulls/:id/intent/refresh. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrIntentResponse } from "@devdigest/shared";
import { api } from "../api";
import { prKeys } from "./keys";

/** GET /pulls/:id/intent — `null` before the first derivation. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: prKeys.intent(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** POST /pulls/:id/intent/refresh — forces re-derivation; refetches on settle. */
export function useRefreshIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent/refresh`),
    onSuccess: (data) => qc.setQueryData(prKeys.intent(prId), data),
    onSettled: () => qc.invalidateQueries({ queryKey: prKeys.intent(prId) }),
  });
}
