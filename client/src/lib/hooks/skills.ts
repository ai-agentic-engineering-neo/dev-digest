/* hooks/skills.ts — React Query hooks for the Skills Lab (/skills) and the
   Agent editor's Skills tab reads through these too, but the per-agent link
   hooks (useAgentSkills / useSetAgentSkills) live in lib/hooks/agents.ts —
   not here (a parallel agent owns that file). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillSource, SkillSummary, SkillStats, SkillType, SkillVersion, SkillImportPreview } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillSummary[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & {
    version_message?: string;
    /** Versions tab "Restore" — loads that version's body server-side and
     * writes it forward as a new version labelled "Restored from vN"; any
     * `body` in the same request is ignored in favour of it. */
    restore_from_version?: number;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

/** `POST /skills/import` — parses only, writes nothing (D6). */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_b64: string }) =>
      api.post<SkillImportPreview>("/skills/import", input),
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined, days = 30) {
  return useQuery({
    queryKey: ["skill-stats", id, days],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats?days=${days}`),
    enabled: !!id,
  });
}

/** Agents currently linking this skill — the delete confirmation (§5.4). */
export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<{ id: string; name: string }[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}
