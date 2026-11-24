/* hooks/skills.ts — React Query hooks for the Skills page, the import flow and
   the agent ↔ skill link set (Agent Editor → Skills tab). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillCreate,
  SkillImportPreview,
  SkillImportRequest,
  SkillListItem,
  SkillUpdate,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillListItem[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillCreate) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: SkillUpdate;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

/** Put an earlier body back. The server appends it as a NEW version (history is kept). */
export function useRestoreSkillVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", id] });
      qc.setQueryData(["skill", id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

/** Parse an uploaded .md/.zip server-side. Saves nothing. */
export function useImportPreview() {
  return useMutation({
    mutationFn: (input: SkillImportRequest) => api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** Ordered skill links of one agent (present link == skill on for that agent). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replace the agent's whole ordered link set. Optimistic; rolls back on error. */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", agentId];
  return useMutation({
    mutationFn: (skillIds: string[]) => api.post<unknown>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onMutate: async (skillIds: string[]) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
