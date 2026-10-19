/* hooks/skills.ts — React Query hooks for L02 Skills (Skills page, skill
   editor/import, and the agent editor's Skills tab). Query keys come from the
   `skillQueries` factory so invalidation and reads can't drift apart. */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillCreateBody,
  SkillImportPreview,
  SkillStats,
  SkillUpdateBody,
  SkillVersion,
} from "@devdigest/shared";

export const skillQueries = {
  all: () => ["skills"] as const,
  list: () => queryOptions({ queryKey: ["skills", "list"], queryFn: () => api.get<Skill[]>("/skills") }),
  detail: (id: string) =>
    queryOptions({ queryKey: ["skills", "detail", id], queryFn: () => api.get<Skill>(`/skills/${id}`) }),
  stats: (id: string) =>
    queryOptions({ queryKey: ["skills", "stats", id], queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`) }),
  versions: (id: string) =>
    queryOptions({
      queryKey: ["skills", "versions", id],
      queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    }),
  agentLinks: (agentId: string) =>
    queryOptions({
      queryKey: ["agent-skills", agentId],
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    }),
};

export function useSkills() {
  return useQuery(skillQueries.list());
}

export function useSkill(id: string) {
  return useQuery(skillQueries.detail(id));
}

export function useSkillStats(id: string) {
  return useQuery(skillQueries.stats(id));
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({ ...skillQueries.versions(id ?? ""), enabled: !!id });
}

/** Skill edits change what goes into agent prompts and the agents' skill counts. */
function useInvalidateSkills() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: skillQueries.all() });
    qc.invalidateQueries({ queryKey: ["agents"] });
  };
}

export function useCreateSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (input: SkillCreateBody) => api.post<Skill>("/skills", input),
    onSuccess: invalidate,
  });
}

export function useUpdateSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillUpdateBody }) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** Parse an uploaded .md/.zip on the server. Saves nothing — see useCreateSkill. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

export function useAgentSkillLinks(agentId: string) {
  return useQuery(skillQueries.agentLinks(agentId));
}

/** Replace the agent's ordered links (link / enable / reorder in one call). */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { skill_id: string; enabled: boolean }[]) =>
      api.put<AgentSkillLink[]>(`/agents/${agentId}/skills`, { items }),
    onSuccess: (links) => {
      qc.setQueryData(skillQueries.agentLinks(agentId).queryKey, links);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

/**
 * Append one skill (enabled, last in order) to each agent's links, keeping
 * the links they already have — PUT /agents/:id/skills replaces the whole set.
 */
export function useAttachSkillToAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, agentIds }: { skillId: string; agentIds: string[] }) =>
      Promise.all(
        agentIds.map(async (agentId) => {
          const links = await api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`);
          const items = [...links]
            .sort((a, b) => a.order - b.order)
            .filter((l) => l.skill_id !== skillId)
            .map((l) => ({ skill_id: l.skill_id, enabled: l.enabled }));
          return api.put<AgentSkillLink[]>(`/agents/${agentId}/skills`, {
            items: [...items, { skill_id: skillId, enabled: true }],
          });
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: skillQueries.all() });
    },
  });
}
