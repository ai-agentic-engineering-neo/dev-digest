/* api/repo-intel.ts — React Query hooks for the repo-intel (T3) index state.
   Mirrors api/context.ts (useContextFiles/useReindexContext) but targets the
   repo-intel facade's HTTP surface:
     GET  /repos/:id/index-state  → RepoIntelState
     POST /repos/:id/resync       → fetch latest from origin + incremental
                                     reindex (202). NOT a destructive re-clone. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { RepoIntelState } from "@devdigest/shared";

export const repoIntelKeys = {
  state: (repoId: string | null | undefined) => ["repo-intel-state", repoId] as const,
};

/** GET /repos/:id/index-state → current repo-intel index state.
    While `poll` is true, refetch on an interval so a running resync's result
    becomes visible. The caller (ProjectContextView) owns when to stop polling
    (the status enum is terminal-only, so completion is detected by watching
    `lastIndexedSha`/`updatedAt` advance, not by status). */
export function useRepoIntelStatus(repoId: string | null | undefined, poll = false) {
  return useQuery({
    queryKey: repoIntelKeys.state(repoId),
    queryFn: () => api.get(`/repos/${repoId}/index-state`, RepoIntelState),
    enabled: !!repoId,
    refetchInterval: poll ? 1500 : false,
  });
}

/** POST /repos/:id/resync → fetch latest + incremental reindex (resync, not re-clone). */
export function useResyncRepoIntel(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string }>(`/repos/${repoId}/resync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repoIntelKeys.state(repoId) });
    },
  });
}
