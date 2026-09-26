/* hooks/skills.ts — React Query hooks for the Skills Lab: the /skills
   master-detail screen, and the agent-editor Skills tab (GET/PUT
   /agents/:id/skills). Mirrors hooks/agents.ts's shape: query keys in
   keys.ts, mutations invalidate on success. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillItem,
  Skill,
  SkillImportPreview,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillVersionDetail,
} from "@devdigest/shared";
import { keys } from "./keys";

// ---- Skills CRUD ----
export function useSkills() {
  return useQuery({
    queryKey: keys.skills(),
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.skill(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: Skill["source"];
  note?: string;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.skills() }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & { note?: string };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.skills() });
      qc.setQueryData(keys.skill(data.id), data);
      qc.invalidateQueries({ queryKey: keys.skillVersions(data.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: keys.skills() });
      qc.removeQueries({ queryKey: keys.skill(id) });
    },
  });
}

// ---- Versions ----
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillVersion(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: keys.skillVersion(id, version),
    queryFn: () => api.get<SkillVersionDetail>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion(id: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    // Body-less POST: matches useCancelRun / useRefreshRepo — apiFetch only
    // sets content-type when a body is actually passed, so no `{}` is needed.
    mutationFn: (version: number) => api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.skills() });
      qc.setQueryData(keys.skill(data.id), data);
      qc.invalidateQueries({ queryKey: keys.skillVersions(data.id) });
    },
  });
}

// ---- Stats ----
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.skillStats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

// ---- Live token count (Config tab body editor) ----
/** Debounced token count for the skill body being edited. Calls POST
   /skills/tokens 400ms after `text` stops changing; `tokens` is null until the
   first response lands (and again while a newer request is still in flight). */
export function useSkillTokenCount(text: string, enabled = true) {
  const mutation = useMutation({
    mutationFn: (t: string) => api.post<{ tokens: number }>("/skills/tokens", { text: t }),
  });
  const { mutate } = mutation;
  React.useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => mutate(text), 400);
    return () => clearTimeout(id);
  }, [text, enabled, mutate]);
  return { tokens: mutation.data?.tokens ?? null, isLoading: mutation.isPending };
}

// ---- Import preview (writes nothing server-side until POST /skills) ----
export interface ImportSkillPreviewInput {
  filename: string;
  content_base64: string;
}

export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: ImportSkillPreviewInput) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

// ---- Agent <-> Skill links (Agent Editor Skills tab) ----
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: keys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillItem[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replaces the agent's full linked-skill list (order + enabled) in one PUT.
   Optimistic: the caller passes the FULL next `AgentSkillItem[]` (as it wants
   it rendered immediately); the cache is updated before the request lands and
   rolled back on failure. Only linked rows are sent over the wire. */
export function useSetAgentSkills(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: AgentSkillItem[]) =>
      api.put<AgentSkillItem[]>(`/agents/${agentId}/skills`, {
        items: items.filter((it) => it.linked).map((it) => ({ skill_id: it.id, enabled: it.enabled })),
      }),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: keys.agentSkills(agentId) });
      const previous = qc.getQueryData<AgentSkillItem[]>(keys.agentSkills(agentId));
      qc.setQueryData(keys.agentSkills(agentId), items);
      return { previous };
    },
    onError: (_err, _items, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.agentSkills(agentId), ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(keys.agentSkills(agentId), data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.agentSkills(agentId) });
      // skill_count on the agent card is derived server-side too.
      qc.invalidateQueries({ queryKey: keys.agents() });
    },
  });
}
