/* hooks/skills.ts — React Query hooks for the Skills page and the agent editor's
   Skills tab (L02). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillPatch,
  SkillPreview,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Everything derived from a skill's body — refetched whenever the skill changes. */
function invalidateSkill(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ["skills"] });
  qc.invalidateQueries({ queryKey: ["skill-versions", id] });
  qc.invalidateQueries({ queryKey: ["skill-preview", id] });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SkillInput, "description"> & { description?: string }) =>
      api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillPatch }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      invalidateSkill(qc, data.id);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

export function useSkillVersions(id: string) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      invalidateSkill(qc, data.id);
    },
  });
}

/** The exact block the agent receives + its token count. */
export function useSkillPreview(id: string) {
  return useQuery({
    queryKey: ["skill-preview", id],
    queryFn: () => api.get<SkillPreview>(`/skills/${id}/preview`),
  });
}

/** Parse an uploaded file server-side. Persists nothing. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (req: SkillImportRequest) =>
      api.post<SkillImportPreview>("/skills/import/preview", req),
  });
}

// ---- agent ⇄ skill links ---------------------------------------------------

export function useAgentSkillLinks(agentId: string) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
  });
}

/** Replace the agent's attached skills; array order = prompt order. */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (links) => {
      qc.setQueryData(["agent-skills", agentId], links);
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
