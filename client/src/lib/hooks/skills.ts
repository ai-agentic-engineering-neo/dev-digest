/* hooks/skills.ts — React Query hooks for the Skills page and the agent Skills tab. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillStatsSummary,
  SkillUpdate,
} from "@devdigest/shared";

/** User-presentable message for a failed mutation/query (keeps ApiError out of components). */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: () => api.get<Skill[]>("/skills") });
}

/** Per-skill usage footer data (agents / pull / accept). Invalidated together with the ["skills"] list. */
export function useSkillsStats() {
  return useQuery({
    queryKey: ["skills", "stats"],
    queryFn: () => api.get<SkillStatsSummary[]>("/skills/stats"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillUpdate }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** Parses an upload into a preview. Stores nothing server-side. */
export function useImportPreview() {
  return useMutation({
    mutationFn: (req: SkillImportRequest) =>
      api.post<SkillImportPreview>("/skills/import/preview", req),
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

function useAgentSkillsCache(agentId: string) {
  const qc = useQueryClient();
  return (links: AgentSkillLink[]) => {
    qc.setQueryData(["agent-skills", agentId], links);
    qc.invalidateQueries({ queryKey: ["agents"] });
  };
}

/** Sets the whole ordered set of linked skills (also used for reorder). */
export function useSetAgentSkills(agentId: string) {
  const store = useAgentSkillsCache(agentId);
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: store,
  });
}

export function useUpdateAgentSkillLink(agentId: string) {
  const store = useAgentSkillsCache(agentId);
  return useMutation({
    mutationFn: ({ skillId, patch }: { skillId: string; patch: { enabled?: boolean; order?: number } }) =>
      api.put<AgentSkillLink[]>(`/agents/${agentId}/skills/${skillId}`, patch),
    onSuccess: store,
  });
}

export function useUnlinkAgentSkill(agentId: string) {
  const store = useAgentSkillsCache(agentId);
  return useMutation({
    mutationFn: (skillId: string) => api.del<AgentSkillLink[]>(`/agents/${agentId}/skills/${skillId}`),
    onSuccess: store,
  });
}
