/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour. */
"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingRun, OnboardingView } from "@devdigest/shared";

const RUN_POLL_MS = 2_000;

const onboardingKey = (repoId: string | null | undefined) => ["onboarding", repoId] as const;

/** Refetch the tour view (e.g. after the code index was rebuilt). */
export function useRefreshOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: onboardingKey(repoId) }), [qc, repoId]);
}

/** Stored tour + latest run + stale flag; polls while a run is running. */
export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingKey(repoId),
    queryFn: () => api.get<OnboardingView>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? RUN_POLL_MS : false),
  });
}

/** Regenerate / Generate: starts a background run and returns the running run. */
export function useGenerateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<{ run: OnboardingRun }>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: ({ run }, repoId) => {
      // keep the last tour visible while the new one is written
      qc.setQueryData<OnboardingView>(onboardingKey(repoId), (old) => ({
        tour: old?.tour ?? null,
        run,
        stale: old?.stale ?? false,
      }));
      qc.invalidateQueries({ queryKey: onboardingKey(repoId) });
    },
  });
}
