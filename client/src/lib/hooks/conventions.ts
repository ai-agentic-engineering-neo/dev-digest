/* hooks/conventions.ts — list / extract / patch for the Conventions page. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCompose,
  ConventionList,
  ConventionPatch,
  Skill,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionList>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(["conventions", repoId], data),
  });
}

export function usePatchConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cid, patch }: { cid: string; patch: ConventionPatch }) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${cid}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export function useComposeConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConventionCompose) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skills`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
