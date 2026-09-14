/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour
   (specs/10-onboarding-generator.md).

   GET /repos/:id/tour polls (~3s) ONLY while `status === 'generating'`, so a
   viewer who did not initiate the generation (another tab, another user)
   still sees it finish — every other status polls never (N7: nothing
   regenerates automatically). POST /repos/:id/tour/generate is also
   "Regenerate" — there is no third route. It writes its own result via
   `setQueryData` in `onSuccess`, so an already-in-flight GET must be
   cancelled first or it can resolve after and overwrite the fresh result
   (client/LEARNINGS.md:361-383). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingGenerateResult, OnboardingPage } from "@devdigest/shared";

export const onboardingKeys = {
  tour: (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const,
};

/** GET /repos/:id/tour — 0 LLM calls (AC-19, AC-20, AC-22, AC-33, AC-37). */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingKeys.tour(repoId),
    queryFn: () => api.get<OnboardingPage>(`/repos/${repoId}/tour`),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 3000 : false),
  });
}

/** POST /repos/:id/tour/generate (AC-13, AC-20, AC-24, AC-34, AC-38) —
 *  triggers a generation (or reports the already-in-flight state back). */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingGenerateResult>(`/repos/${repoId}/tour/generate`),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: onboardingKeys.tour(repoId) });
    },
    onSuccess: (data) => {
      qc.setQueryData(onboardingKeys.tour(repoId), data);
    },
  });
}
