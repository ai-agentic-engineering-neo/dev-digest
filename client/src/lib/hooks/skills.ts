/* hooks/skills.ts — React Query hooks for /skills (L02 Skills feature).

   One cache entry per skill (`["skill", id]`) plus the rail list (`["skills"]`).
   Every mutation writes BOTH so the rail toggle and the Config-tab toggle are
   the same `skills.enabled` gate rather than two pieces of local state. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Skill,
  SkillImportPreview,
  SkillPreview,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillWithStats,
} from "@devdigest/shared";

/** ms the body editor waits after the last keystroke before re-tokenizing. */
export const TOKEN_DEBOUNCE_MS = 400;

export const skillKeys = {
  list: () => ["skills"] as const,
  one: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill-versions", id] as const,
  version: (id: string | null | undefined, v: number) => ["skill-version", id, v] as const,
  preview: (id: string | null | undefined) => ["skill-preview", id] as const,
  stats: (id: string | null | undefined) => ["skill-stats", id] as const,
  tokens: (body: string) => ["skill-tokens", body] as const,
};

/** Rail list. Carries the batched per-skill stats — never one request per card. */
export function useSkills() {
  return useQuery({
    queryKey: skillKeys.list(),
    queryFn: () => api.get<SkillWithStats[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.one(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.setQueryData(skillKeys.one(data.id), data);
      qc.invalidateQueries({ queryKey: skillKeys.list() });
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
      // Write the detail entry AND patch the row inside the rail list, so a
      // toggle flipped in either place is visible in the other before the
      // refetch lands. Stats on the row are preserved — the PUT doesn't return them.
      qc.setQueryData(skillKeys.one(data.id), data);
      qc.setQueryData<SkillWithStats[]>(skillKeys.list(), (rows) =>
        rows?.map((r) => (r.id === data.id ? { ...r, ...data } : r)),
      );
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.preview(data.id) });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: skillKeys.one(id) });
      qc.invalidateQueries({ queryKey: skillKeys.list() });
    },
  });
}

/** Archived bodies, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** One archived snapshot. The list already carries bodies; this backs a deep link. */
export function useSkillVersion(id: string | null | undefined, version: number | null) {
  return useQuery({
    queryKey: skillKeys.version(id, version ?? -1),
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

/** The exact block the run executor injects, plus its real token cost. */
export function useSkillPreview(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.preview(id),
    queryFn: () => api.get<SkillPreview>(`/skills/${id}/preview`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.stats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/**
 * Live token count for the body editor. Debounced, and it keeps showing the
 * last settled value while a newer count is in flight (`placeholderData`).
 *
 * This is a REAL tokenizer count served by `POST /skills/tokens`, not
 * `chars / 4` — the same number reappears in the Preview tab and in
 * `run_skills`, so an estimate here would make the three disagree.
 */
export function useTokenCount(body: string): number | null {
  const [debounced, setDebounced] = React.useState(body);

  React.useEffect(() => {
    const h = setTimeout(() => setDebounced(body), TOKEN_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [body]);

  const q = useQuery({
    queryKey: skillKeys.tokens(debounced),
    queryFn: () => api.post<{ tokens: number }>("/skills/tokens", { body: debounced }),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });

  return q.data?.tokens ?? null;
}

/**
 * Parse-only import. Returns a preview; NOTHING is persisted until the user
 * confirms and the drawer calls `useCreateSkill`.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_b64: string }) =>
      api.post<SkillImportPreview>("/skills/import", input),
  });
}
