/* hooks/conventions.ts — React Query hooks for the Conventions page (L02):
   scan a repo, accept/reject candidates, merge accepted ones into a skill. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionStatus,
  ConventionsList,
  CreateSkillFromConventionsRequest,
  Skill,
} from "@devdigest/shared";

const key = (repoId: string) => ["conventions", repoId] as const;

export function useConventions(repoId: string) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionsList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Runs a new scan (one LLM call); the response replaces the cached list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsList>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(key(repoId), data),
  });
}

/** Optimistic status change; rolls back on error. */
export function useSetConventionStatus(repoId: string) {
  const qc = useQueryClient();
  const patch = (id: string, status: ConventionStatus) =>
    qc.setQueryData<ConventionsList>(key(repoId), (prev) =>
      prev && {
        ...prev,
        candidates: prev.candidates.map((c) => (c.id === id ? { ...c, status } : c)),
      },
    );
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ConventionStatus }) =>
      api.put<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const prev = qc.getQueryData<ConventionsList>(key(repoId));
      patch(id, status);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key(repoId), ctx.prev);
    },
  });
}

export function useCreateSkillFromConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsRequest) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
