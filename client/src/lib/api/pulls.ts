/* api/pulls.ts — Pull requests (F1: GET /repos/:id/pulls, GET /pulls/:id). */

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { PrMeta, PrDetail } from "@devdigest/shared";

export const pullKeys = {
  all: ["pulls"] as const,
  list: (repoId: string | null | undefined) => ["pulls", repoId] as const,
  detail: (prId: string | number | null | undefined) => ["pull", prId] as const,
};

export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: pullKeys.list(repoId),
    queryFn: () => api.get(`/repos/${repoId}/pulls`, PrMeta.array()),
    enabled: !!repoId,
    // Auto-refresh PR statuses: re-sync from GitHub every 60s while the page is
    // open, and whenever the window regains focus.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: pullKeys.detail(prId),
    queryFn: () => api.get(`/pulls/${prId}`, PrDetail),
    enabled: prId != null,
  });
}
