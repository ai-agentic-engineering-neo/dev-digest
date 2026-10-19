/* hooks/conventions.ts — React Query hooks for L02 Conventions (extract house
   rules from a repo, accept / reject / edit candidates). The list polls while
   an extraction is running; composing a skill uses hooks/skills. */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionScan,
  ConventionUpdateBody,
  ConventionsList,
} from "@devdigest/shared";

/** Poll cadence while the latest extraction is `running`. */
const EXTRACT_POLL_MS = 2000;

export const conventionQueries = {
  list: (repoId: string) =>
    queryOptions({
      queryKey: ["conventions", repoId],
      queryFn: () => api.get<ConventionsList>(`/repos/${repoId}/conventions`),
    }),
};

export function useConventions(repoId: string) {
  return useQuery({
    ...conventionQueries.list(repoId),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.scan?.status === "running" ? EXTRACT_POLL_MS : false),
  });
}

/** Start an extraction (202); the list then polls until the scan finishes. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ scan: ConventionScan }>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionQueries.list(repoId).queryKey }),
  });
}

/** Edit and/or accept / reject one candidate; patches the cached list in place. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionUpdateBody }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) =>
      qc.setQueryData(conventionQueries.list(repoId).queryKey, (prev) =>
        prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev,
      ),
  });
}

/** Accept all / Reject all — applies to pending candidates only. */
export function useBulkConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "accepted" | "rejected") =>
      api.post<{ updated: number }>(`/repos/${repoId}/conventions/bulk`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionQueries.list(repoId).queryKey }),
  });
}
