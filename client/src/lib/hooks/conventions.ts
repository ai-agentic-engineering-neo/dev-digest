/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (/repos/:repoId/conventions). One cache entry per repo's latest scan
   (["conventions", repoId]); accept/reject and skill-creation both write
   through it optimistically so the card list never flashes stale state. */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionsList, Skill } from "@devdigest/shared";

export const conventionsKeys = {
  list: (repoId: string | null | undefined) => ["conventions", repoId] as const,
};

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionsKeys.list(repoId),
    queryFn: () => api.get<ConventionsList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsList>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData(conventionsKeys.list(repoId), data);
    },
  });
}

export function useSetConventionStatus(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "rejected" }) =>
      api.put<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, { status }),
    onSuccess: (data) => {
      qc.setQueryData<ConventionsList>(conventionsKeys.list(repoId), (cur) =>
        cur
          ? { ...cur, candidates: cur.candidates.map((c) => (c.id === data.id ? data : c)) }
          : cur,
      );
    },
  });
}

export interface CreateSkillFromConventionsInput {
  convention_ids: string[];
  name: string;
  description: string;
  enabled: boolean;
  body?: string;
}

export function useCreateSkillFromConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      // A new skill exists now — the Skills Lab rail should reflect it.
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
