/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (server/specs/conventions.md). Mirrors hooks/skills.ts's shape: query keys
   in keys.ts, mutations invalidate on success. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionList, ConventionSkillPreview, Skill, SkillType } from "@devdigest/shared";
import { keys } from "./keys";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: keys.conventions(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export type ConventionExtractResult = ConventionList & { dropped: number };

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(keys.conventions(repoId), data),
  });
}

export interface PatchConventionInput {
  id: string;
  patch: { status?: ConventionCandidate["status"]; rule?: string; category?: string };
}

export function usePatchConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conventions(repoId) }),
  });
}

/** "Deselect all" — a client-side bulk PATCH (accepted -> pending), not a new endpoint. */
export function useDeselectAllConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api.patch<ConventionCandidate>(`/conventions/${id}`, { status: "pending" }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conventions(repoId) }),
  });
}

export function useConventionsSkillPreview(repoId: string | null | undefined) {
  return useMutation({
    mutationFn: () => api.post<ConventionSkillPreview>(`/repos/${repoId}/conventions/skill/preview`),
  });
}

export interface CreateConventionsSkillInput {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  replace_skill_id?: string;
}

export function useCreateConventionsSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionsSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.skills() }),
  });
}
