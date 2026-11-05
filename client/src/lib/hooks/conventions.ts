/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (Skills Lab → Conventions): extract candidates from a repo, accept / reject /
   edit them, and turn the accepted ones into one `<repo>-conventions` skill. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillType } from "@devdigest/shared";
import type { Convention, ConventionExtractResult, ConventionStatus, ConventionsSkillDraft } from "../types";

const key = (repoId: string) => ["conventions", repoId] as const;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<Convention[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run (or re-run) the extraction: sample by code → model → evidence check. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (res) => qc.setQueryData(key(repoId), res.candidates),
  });
}

export interface ConventionPatchInput {
  id: string;
  patch: { status?: ConventionStatus; rule?: string };
}

/** Accept / reject / edit one candidate. Optimistic — the card flips at once. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: ConventionPatchInput) => api.patch<Convention>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const prev = qc.getQueryData<Convention[]>(key(repoId));
      qc.setQueryData<Convention[]>(key(repoId), (list) =>
        list?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key(repoId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Set every candidate's status at once ("Accept all" / "Deselect all"). */
export function useSetAllConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: ConventionStatus) =>
      api.post<Convention[]>(`/repos/${repoId}/conventions/status`, { status }),
    onSuccess: (list) => qc.setQueryData(key(repoId), list),
  });
}

/** The merged skill draft built server-side from the accepted candidates. */
export function useConventionsSkillDraft(repoId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["conventions-skill-draft", repoId],
    queryFn: () => api.get<ConventionsSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export interface CreateConventionsSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  agent_id: string | null;
}

export function useCreateConventionsSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionsSkillInput) =>
      api.post<{ skill: Skill; linked_agent_id: string | null }>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-usage"] });
      qc.invalidateQueries({ queryKey: ["skill-card-stats"] });
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
      if (res.linked_agent_id) qc.invalidateQueries({ queryKey: ["agent-skills", res.linked_agent_id] });
    },
  });
}
