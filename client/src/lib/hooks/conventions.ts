/* hooks/conventions.ts — React Query hooks for the Conventions page: the
   candidate list of a repo, extraction (re-scan), accept/edit and reject. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionUpdate,
} from "@devdigest/shared";

const key = (repoId: string | null | undefined) => ["conventions", repoId] as const;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run (or re-run) extraction. The response carries the fresh list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (res) => qc.setQueryData(key(repoId), res.candidates),
  });
}

/** Accept/un-accept or edit the text of one candidate (optimistic). */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionUpdate }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const prev = qc.getQueryData<ConventionCandidate[]>(key(repoId));
      qc.setQueryData<ConventionCandidate[]>(key(repoId), (list) =>
        list?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key(repoId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Reject = remove the candidate. */
export function useRejectConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/conventions/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const prev = qc.getQueryData<ConventionCandidate[]>(key(repoId));
      qc.setQueryData<ConventionCandidate[]>(key(repoId), (list) => list?.filter((c) => c.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key(repoId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Select / deselect every candidate. */
export function useSetAllConventionsAccepted(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepted: boolean) =>
      api.patch<ConventionCandidate[]>(`/repos/${repoId}/conventions`, { accepted }),
    onSuccess: (list) => qc.setQueryData(key(repoId), list),
  });
}
