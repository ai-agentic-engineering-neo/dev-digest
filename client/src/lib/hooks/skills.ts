/* hooks/skills.ts — React Query hooks for the M2 Skills Lab: CRUD, versions,
   restore and the two-step import (preview, then save). */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type {
  Skill,
  SkillInput,
  SkillUpdate,
  SkillVersion,
  SkillImportRequest,
  SkillImportPreview,
} from "@devdigest/shared";

/** Refresh everything a changed skill shows up in. */
function refreshSkill(qc: QueryClient, skill: Skill) {
  qc.setQueryData(queryKeys.skill(skill.id), skill);
  qc.invalidateQueries({ queryKey: queryKeys.skills() });
  qc.invalidateQueries({ queryKey: queryKeys.skill(skill.id) });
  qc.invalidateQueries({ queryKey: queryKeys.skillVersions(skill.id) });
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills(),
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skill(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills() }),
    meta: { errorUi: "inline" },
  });
}

export interface UpdateSkillVars {
  id: string;
  patch: SkillUpdate;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillVars) => api.patch<Skill>(`/skills/${id}`, patch),
    onSuccess: (skill) => refreshSkill(qc, skill),
    meta: { errorUi: "inline" },
  });
}

export function useSetSkillEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<Skill>(`/skills/${id}/enabled`, { enabled }),
    onSuccess: (skill) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.skill(skill.id) });
      // Agent Skills tabs show an "off globally" badge from this flag.
      qc.invalidateQueries({ queryKey: queryKeys.agentSkillsAll() });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.agentSkillsAll() });
      qc.removeQueries({ queryKey: queryKeys.skill(id) });
      qc.removeQueries({ queryKey: queryKeys.skillVersions(id) });
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** One stored version; pass `null` as `version` until it is needed (Diff modal). */
export function useSkillVersion(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersion(id, version),
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (skill) => refreshSkill(qc, skill),
    meta: { errorUi: "inline" },
  });
}

/** Parse an upload; stores nothing on the server. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: SkillImportRequest) => api.post<SkillImportPreview>("/skills/import/preview", input),
    meta: { errorUi: "inline" },
  });
}

/** Save the edited preview (`source = 'imported_file'`). */
export function useImportSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills/import", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills() }),
    meta: { errorUi: "inline" },
  });
}
