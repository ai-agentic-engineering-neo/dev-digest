/* hooks/conventions.ts — React Query hooks for the M2 Conventions Extractor:
   the repo's candidates, a scan, accept / reject / edit, and the skill built
   from the accepted ones. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConventionCandidate,
  ConventionList,
  ConventionPatch,
  ConventionSkillInput,
  Skill,
} from "@devdigest/shared";
import { api } from "../api";
import { queryKeys } from "./query-keys";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conventions(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionList>(`/repos/${repoId}/conventions/extract`, {}),
    onSuccess: (list) => qc.setQueryData(queryKeys.conventions(repoId), list),
    meta: { errorUi: "inline" },
  });
}

export interface PatchConventionVars {
  id: string;
  patch: ConventionPatch;
}

/** Accept / reject / edit one candidate; the list updates optimistically. */
export function usePatchConvention(repoId: string) {
  const qc = useQueryClient();
  const key = queryKeys.conventions(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionVars) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionList>(key);
      if (previous) {
        qc.setQueryData<ConventionList>(key, {
          ...previous,
          candidates: previous.candidates.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
                  ...(patch.status !== undefined ? { status: patch.status, accepted: patch.status === "accepted" } : {}),
                }
              : c,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateConventionSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConventionSkillInput) => api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills() }),
    meta: { errorUi: "inline" },
  });
}
