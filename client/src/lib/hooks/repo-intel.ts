/* hooks/repo-intel.ts — React Query hooks for the repo-intel (T3) index state.
   Mirrors hooks/context.ts (useIndexStatus/useReindex) but targets the
   repo-intel facade's HTTP surface:
     GET  /repos/:id/index-state  → RepoIntelState
     POST /repos/:id/reindex      → enqueue a full reindex (202). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** Subset of the server's IndexState the badge needs (kept local — not in
    @devdigest/shared, since repo-intel types live server-side). */
export interface RepoIntelState {
  status: "full" | "partial" | "degraded" | "failed";
  filesIndexed: number;
  filesSkipped: number;
  degraded?: boolean;
  degradedReason?: string;
  reason?: string;
}

/** GET /repos/:id/index-state → current repo-intel index state. */
export function useRepoIntelStatus(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["repo-intel-state", repoId],
    queryFn: () => api.get<RepoIntelState>(`/repos/${repoId}/index-state`),
    enabled: !!repoId,
  });
}

/** POST /repos/:id/reindex → enqueue a full repo-intel reindex. */
export function useReindexRepoIntel(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string }>(`/repos/${repoId}/reindex`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repo-intel-state", repoId] });
    },
  });
}
