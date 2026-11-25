/* hooks/pulls.ts — pull requests (GET /repos/:id/pulls, GET /pulls/:id). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrMeta, PrDetail } from "../types";
import { pullKeys } from "./keys";

/** Re-sync PR statuses from GitHub while the page is open. */
const PULLS_REFETCH_MS = 60_000;

export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: pullKeys.list(repoId),
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    refetchInterval: PULLS_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: pullKeys.detail(prId),
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}
