/* hooks/skills.ts — React Query hooks for M2 Skills (Skills page + the agent
   editor's Skills tab). Components never call `api` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { api } from "../api";
import type {
  AgentSkillView,
  ConfirmSkillImportInput,
  CreateSkillInput,
  SetAgentSkillsInput,
  Skill,
  SkillImportPreview,
  SkillPreviewBlock,
  SkillStats,
  SkillVersion,
  UpdateSkillInput,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({ queryKey: queryKeys.skills(), queryFn: () => api.get<Skill[]>("/skills") });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skill(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillPreview(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillPreview(id),
    queryFn: () => api.get<SkillPreviewBlock>(`/skills/${id}/preview`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillStats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** One version WITH its body (Diff modal). */
export function useSkillVersion(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersion(id, version),
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

/** After any write to a skill: refresh the list + everything cached for it. */
function useInvalidateSkill() {
  const qc = useQueryClient();
  return (skill: Skill) => {
    qc.invalidateQueries({ queryKey: queryKeys.skills() });
    qc.invalidateQueries({ queryKey: queryKeys.skillAll(skill.id) });
    qc.setQueryData(queryKeys.skill(skill.id), skill);
  };
}

export function useCreateSkill() {
  const invalidate = useInvalidateSkill();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: invalidate,
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  const invalidate = useInvalidateSkill();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSkillInput }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (skill) => {
      invalidate(skill);
      // name/enabled show up on every agent's Skills tab
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.removeQueries({ queryKey: queryKeys.skillAll(id) });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

export function useRestoreSkillVersion() {
  const invalidate = useInvalidateSkill();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: invalidate,
  });
}

/** base64 of a File's bytes (the import route takes JSON, not multipart). */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Step 1 of import: parse the file server-side. Saves nothing. */
export function useImportPreview() {
  return useMutation({
    mutationFn: async (file: File) =>
      api.post<SkillImportPreview>("/skills/import/preview", {
        file_name: file.name,
        content_base64: await fileToBase64(file),
      }),
  });
}

/** Step 2 of import: save the reviewed + trusted preview. */
export function useConfirmImport() {
  const invalidate = useInvalidateSkill();
  return useMutation({
    mutationFn: (input: ConfirmSkillImportInput) => api.post<Skill>("/skills/import", input),
    onSuccess: invalidate,
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillView[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: SetAgentSkillsInput }) =>
      api.put<AgentSkillView[]>(`/agents/${agentId}/skills`, input),
    onSuccess: (links, { agentId }) => {
      qc.setQueryData(queryKeys.agentSkills(agentId), links);
      // agent version bumps when the enabled set changes; skill cards count agents
      qc.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}
