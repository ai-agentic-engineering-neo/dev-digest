/* hooks/skills.ts — React Query hooks for the Skills Lab (skill library used
   by agents). Mirrors hooks/agents.ts's conventions exactly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../api";
// Value (not `import type`) import — doubles as the runtime schema used to
// validate the /skills and /skills/:id responses below.
import { Skill } from "@devdigest/shared";
import type { SkillType, SkillSource } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get("/skills", z.array(Skill)),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skills", id],
    queryFn: () => api.get(`/skills/${id}`, Skill),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  // Only settable on create — an existing skill's provenance doesn't change.
  source?: SkillSource;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post("/skills", input, Skill),
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
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put(`/skills/${id}`, patch, Skill),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skills", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skills", id] });
    },
  });
}

/** Import-preview request body: a file picked for the "Import from file" flow. */
export interface ImportSkillPreviewInput {
  filename: string;
  content_base64: string;
}

/** Parsed-but-not-persisted preview of a skill extracted from an uploaded file.
 *  Nothing is written server-side by this call, so there's no cache to
 *  invalidate — the caller takes this preview and, if accepted, submits it
 *  through useCreateSkill. */
export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: SkillSource;
  evidence_files: string[];
}

export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: ImportSkillPreviewInput) =>
      api.post<SkillImportPreview>("/skills/import", input),
  });
}
