/* hooks/skills.ts — React Query hooks for the Skills page and the agent
   editor's Skills tab (L02). Skills are text-only, reusable review rules. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentSkillLink, Skill, SkillImportPreview, SkillType, SkillVersion, SkillVersionDiff } from "@devdigest/shared";

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

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  /** Set by the import flow on confirm; omitted (= manual) otherwise. */
  source?: "manual" | "imported_file";
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-version-diff", data.id] });
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
      qc.removeQueries({ queryKey: ["skill-versions", id] });
      // Links cascade server-side: agent skill counts and tabs must refetch.
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** `POST /skills/import/preview`: the parsed core (`SkillImportPreview` contract), nothing saved yet. */
export function usePreviewSkillImport() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** Ordered links for one agent (`GET /agents/:id/skills`). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace the agent's ordered skill set. A changed set bumps the agent version.
 * The links cache is written optimistically so the tab re-renders at once and
 * rolled back when the server rejects the set.
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onMutate: async ({ agentId, skillIds }) => {
      await qc.cancelQueries({ queryKey: ["agent-skills", agentId] });
      const previous = qc.getQueryData<AgentSkillLink[]>(["agent-skills", agentId]);
      qc.setQueryData<AgentSkillLink[]>(
        ["agent-skills", agentId],
        skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })),
      );
      return { previous };
    },
    onError: (_err, { agentId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(["agent-skills", agentId], ctx.previous);
    },
    onSuccess: (links, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], links);
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
}

/** Body history of a skill, newest first (`GET /skills/:id/versions`). */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Unified diff from one version to the current body; fetched only when `version` is set. */
export function useSkillVersionDiff(id: string | null | undefined, version: number | null) {
  return useQuery({
    queryKey: ["skill-version-diff", id, version],
    queryFn: () => api.get<SkillVersionDiff>(`/skills/${id}/versions/${version}/diff`),
    enabled: !!id && version != null,
  });
}

/** Restore: the chosen version's body becomes a new current version. */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-version-diff", data.id] });
    },
  });
}
