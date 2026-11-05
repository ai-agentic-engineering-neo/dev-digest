/* hooks/skills.ts — React Query hooks for the Skills page, skill editor and the
   Agent Editor's Skills tab. Skills are text-only prompt blocks reused across
   agents; links (agent ↔ skill, ordered) live on /agents/:id/skills. */
"use client";

import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentSkillLink, Skill, SkillType } from "@devdigest/shared";
import type { SkillCardStats, SkillImportPreview, SkillStats, SkillVersionRecord } from "../types";

/** Every cache that shows per-skill stats (cards + Stats tab). */
function invalidateSkillStats(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ["skill-card-stats"] });
  qc.invalidateQueries({ queryKey: ["skill-stats"] });
}

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

/** skill id → number of agents it is linked to. */
export function useSkillUsage() {
  return useQuery({
    queryKey: ["skill-usage"],
    queryFn: () => api.get<Record<string, number>>("/skills/usage"),
  });
}

export interface SkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** "What changed" — stored on the version a content change creates. */
  note?: string;
  /** Create only — defaults to enabled on the server. */
  enabled?: boolean;
}

/** Card numbers for every skill (agents · pull % · accept %). */
export function useSkillCardStats() {
  return useQuery({
    queryKey: ["skill-card-stats"],
    queryFn: () => api.get<Record<string, SkillCardStats>>("/skills/stats"),
  });
}

/** Stats tab: 30-day usage, rates and findings by category. */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Versions tab: body history with notes, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersionRecord[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      invalidateSkillStats(qc);
    },
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<SkillInput & { enabled: boolean }>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (_s, { id }) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", id] });
      invalidateSkillStats(qc);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-usage"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      invalidateSkillStats(qc);
    },
  });
}

/** An upload as the API expects it (file read client-side → base64). */
export interface SkillUpload {
  filename: string;
  content_base64: string;
}

/** Parse an upload into a preview — nothing is saved. */
export function usePreviewSkillImport() {
  return useMutation({
    mutationFn: (upload: SkillUpload) => api.post<SkillImportPreview>("/skills/import/preview", upload),
  });
}

/** Confirm an import: the server re-parses the same upload and saves it as untrusted. */
export function useImportSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillUpload & Partial<Pick<SkillInput, "name" | "description" | "type">>) =>
      api.post<Skill>("/skills/import", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      invalidateSkillStats(qc);
    },
  });
}

/** Ordered skill links of an agent. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** agent id → linked skill count (shares the ["agent-skills", id] cache with the Skills tab). */
export function useAgentSkillCounts(agentIds: string[]): Record<string, number | undefined> {
  const results = useQueries({
    queries: agentIds.map((id) => ({
      queryKey: ["agent-skills", id],
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${id}/skills`),
    })),
  });
  return Object.fromEntries(agentIds.map((id, i) => [id, results[i]?.data?.length]));
}

/** Replace an agent's linked skills with `skillIds` (order = prompt order). */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onMutate: async (skillIds) => {
      // optimistic: checkbox / drag feels instant
      await qc.cancelQueries({ queryKey: ["agent-skills", agentId] });
      const prev = qc.getQueryData<AgentSkillLink[]>(["agent-skills", agentId]);
      qc.setQueryData<AgentSkillLink[]>(
        ["agent-skills", agentId],
        skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["agent-skills", agentId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      qc.invalidateQueries({ queryKey: ["skill-usage"] });
      invalidateSkillStats(qc); // linked-agent counts + pull rate depend on links
    },
  });
}

/** Read a browser File as base64 (no data: prefix) for the import endpoints. */
export async function fileToUpload(file: File): Promise<SkillUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { filename: file.name, content_base64: btoa(binary) };
}
