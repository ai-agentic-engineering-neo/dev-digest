/* hooks/intent.ts — React Query hooks for the L03 Intent card. Not
   re-exported from hooks/index.ts (frontend-ui-architecture §11 forbids
   `export *` barrels growing without bound) — import this file directly:
   `import { usePrIntent } from "@/lib/hooks/intent"`. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse, DeriveIntentResponse } from "@devdigest/shared";

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/**
 * Derive (or force-regenerate) the intent for a PR. A MUTATION, not a query:
 * it costs a model call, so it must never run on mount, on a refocus or on a
 * retry (same pattern as `useExtractConventions`). Seeds the query cache from
 * its own response instead of forcing a refetch.
 */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { force: boolean }) =>
      api.post<DeriveIntentResponse>(`/pulls/${prId}/intent`, { force: opts.force }),
    onSuccess: (data) => {
      qc.setQueryData(["pr-intent", prId], { intent: data.intent });
    },
  });
}
