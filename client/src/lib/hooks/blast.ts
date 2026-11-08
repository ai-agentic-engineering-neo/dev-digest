/* hooks/blast.ts — blast radius of a PR (changed symbols → callers → endpoints/crons) and the
   earlier PRs of the same repo that touched the same files. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBlastRadius, PriorPullsResponse } from "../types";

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<PrBlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

export function usePriorPulls(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["prior-pulls", prId],
    queryFn: () => api.get<PriorPullsResponse>(`/pulls/${prId}/prior-pulls`),
    enabled: !!prId,
  });
}
