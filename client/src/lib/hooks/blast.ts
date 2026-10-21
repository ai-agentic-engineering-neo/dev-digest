/* hooks/blast.ts — React Query hook for the PR blast radius:
     GET /pulls/:id/blast → BlastRadiusResponse (read-time, from the repo index;
     no model call). Rebuilding the index is useResyncRepoIntel (hooks/repo-intel). */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { api } from "../api";

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
