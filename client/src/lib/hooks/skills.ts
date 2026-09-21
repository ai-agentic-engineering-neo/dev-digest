/* hooks/skills.ts — React Query hooks for the Skills page, the skill editor,
   the import flow, and the agent editor's Skills tab. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillDetail,
  Skill,
  SkillImportPreview,
  SkillType,
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

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: Skill["source"];
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
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      // A body edit mints a new version — the history list is now stale.
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      // A skill's global toggle changes what every agent's prompt contains.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
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
      // Deleting cascades the agent links, so every agent's tab is stale.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/**
 * Parse a document into a skill core WITHOUT saving it. Deliberately a mutation
 * rather than a query: it is a user-triggered step in a wizard, not cacheable
 * state, and running it twice for the same file should hit the server twice.
 */
export function useImportPreview() {
  return useMutation({
    mutationFn: (input: {
      text: string;
      origin?: string;
      source?: Skill["source"];
      skipped_entries?: string[];
    }) => api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** Same, for a URL the user typed — the server fetches it behind SSRF guards. */
export function useImportPreviewFromUrl() {
  return useMutation({
    mutationFn: (url: string) => api.post<SkillImportPreview>("/skills/import/url", { url }),
  });
}

// ---- agent ⇄ skill links -------------------------------------------------

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillDetail[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace an agent's whole ordered skill list. Attach, detach, reorder and the
 * per-agent on/off switch all go through here, because the tab always holds the
 * complete list — one request per interaction, no partial states to reconcile.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skills: { skill_id: string; enabled: boolean }[]) =>
      api.post<AgentSkillDetail[]>(`/agents/${agentId}/skills`, { skills }),
    onSuccess: (data) => {
      qc.setQueryData(["agent-skills", agentId], data);
      // The card's "N skills" badge is derived from these links.
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
