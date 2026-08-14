/* hooks/brief.ts — React Query hooks for the PR Why + Risk Brief
   (specs/11-why-risk-brief.md).

   GET /pulls/:id/brief polls (~3s) ONLY while `status === 'generating'`, so a
   viewer who did not initiate the generation (another tab, another user)
   still sees it finish — every other status polls never (D13/N5: nothing
   regenerates automatically; polling itself is not generating). POST
   /pulls/:id/brief/generate is also "Regenerate" (AC-26) — there is no third
   route. It writes its own result via `setQueryData` in `onSuccess`, so an
   already-in-flight GET must be cancelled first or it can resolve after and
   overwrite the fresh result (client/LEARNINGS.md:381-403). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { BriefGenerateResult, BriefPage } from "@devdigest/shared";

export const briefKeys = {
  page: (prId: string | null | undefined) => ["pr-brief", prId] as const,
};

/** GET /pulls/:id/brief — 0 LLM calls (AC-23). */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKeys.page(prId),
    queryFn: () => api.get<BriefPage>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 3000 : false),
  });
}

/** POST /pulls/:id/brief/generate (AC-10, AC-24, AC-26, AC-27, AC-28) —
 *  triggers a generation (or reports the already-in-flight state back).
 *  `regenerate: true` is the SAME action as the first "Generate" — it just
 *  skips the cache check server-side. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { regenerate?: boolean } = {}) =>
      api.post<BriefGenerateResult>(`/pulls/${prId}/brief/generate`, {
        regenerate: input.regenerate ?? false,
      }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: briefKeys.page(prId) });
    },
    onSuccess: (data) => {
      qc.setQueryData(briefKeys.page(prId), data);
    },
  });
}
