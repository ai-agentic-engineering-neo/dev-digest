/* hooks/skills.ts — React Query hooks for the Skills screen and the import flow. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CommunitySkill,
  Skill,
  SkillImportPreview,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

/** An agent that links a skill — the Stats tab's "used by" list. */
export interface SkillAgent {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
}

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
  note?: string;
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
    /** One-line "what changed", stored on the version a body edit creates. */
    note?: string;
  };
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

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Restore writes the old body as a NEW version; history is append-only. */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<SkillAgent[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

/** The bundled catalog (server-side constants) — no GitHub call. */
export function useCommunitySkills(q: string, lang: string) {
  return useQuery({
    queryKey: ["community-skills", q, lang],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (lang && lang !== "any") params.set("lang", lang);
      const qs = params.toString();
      return api.get<CommunitySkill[]>(`/skills/community${qs ? `?${qs}` : ""}`);
    },
  });
}

export type ImportPreviewInput =
  | { filename: string; content_base64: string }
  | { community_id: string };

/**
 * Step 1 of the import: the server parses the upload and returns what it WOULD
 * store. Nothing is persisted, so this is a mutation only in the HTTP sense —
 * it invalidates nothing.
 */
export function useImportPreview() {
  return useMutation({
    mutationFn: (input: ImportPreviewInput) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

export interface ImportCommitInput {
  name: string;
  description: string;
  type: SkillType;
  source: "imported_url" | "community";
  body: string;
}

/** Step 2: persist exactly what the user confirmed (it lands disabled). */
export function useImportSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportCommitInput) => api.post<Skill>("/skills/import", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
