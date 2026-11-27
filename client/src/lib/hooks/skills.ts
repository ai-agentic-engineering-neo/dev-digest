/* hooks/skills.ts — React Query hooks for the M2 Skills page (list, detail tabs). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { api } from "../api";
import type {
  AgentSuggestion,
  CreateSkillInput,
  ImportedSkillDraft,
  Skill,
  SkillSafety,
  SkillStats,
  SkillUsage,
  SkillVersion,
  UpdateSkillInput,
} from "@devdigest/shared";

const skillPath = (id: string) => `/skills/${encodeURIComponent(id)}`;

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills(),
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skill(id),
    queryFn: () => api.get<Skill>(skillPath(id!)),
    enabled: !!id,
  });
}

/**
 * Prompt-injection scan of a draft body before it is saved (writes nothing; the
 * server scans again on save). Keyed by the text, so the same text is scanned
 * once; the caller passes an already-debounced body. Off for an empty body.
 */
export function useSkillScan(body: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.skillScan(body),
    queryFn: () => api.post<SkillSafety>("/skills/scan", { body }),
    enabled: enabled && body.trim().length > 0,
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * "Import from URL": the server fetches the file (https, public hosts, ≤ 64 KB)
 * and returns a scanned draft; nothing is saved. A refused URL (422) is shown
 * inline in the dialog, so the global error toast is skipped.
 */
export function useImportSkillUrl() {
  return useMutation({
    mutationFn: (url: string) => api.post<ImportedSkillDraft>("/skills/import-url", { url }),
    meta: { inlineError: true },
  });
}

/** Agents the skill is attached to (delete dialog). */
export function useSkillUsage(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.skillUsage(id),
    queryFn: () => api.get<SkillUsage[]>(`${skillPath(id!)}/agents`),
    enabled: !!id && enabled,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillStats(id),
    queryFn: () => api.get<SkillStats>(`${skillPath(id!)}/stats`),
    enabled: !!id,
  });
}

/** Agents that may want this skill (code-only match; GET writes nothing). */
export function useAgentSuggestions(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentSuggestions(id),
    queryFn: () => api.get<AgentSuggestion[]>(`${skillPath(id!)}/agent-suggestions`),
    enabled: !!id,
    // Fresh on every open: a merge or a link made elsewhere (agent Skills tab) changes
    // the list, and a cached one would offer an agent that already has the skill.
    staleTime: 0,
  });
}

/** Version history, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`${skillPath(id!)}/versions`),
    enabled: !!id,
  });
}

/** Input as the user types it: server-side defaults may be left out. */
export type CreateSkillBody = Partial<CreateSkillInput> & Pick<CreateSkillInput, "name" | "body">;

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillBody) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.setQueryData(queryKeys.skill(data.id), data);
    },
  });
}

export interface UpdateSkillVars {
  id: string;
  patch: UpdateSkillInput;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillVars) => api.put<Skill>(skillPath(id), patch),
    onSuccess: (data, { patch }) => {
      qc.setQueryData(queryKeys.skill(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.skillVersions(data.id) });
      qc.invalidateQueries({ queryKey: queryKeys.skillStats(data.id) });
      // A rename changes the "in <skill>" badges on conventions pages.
      if (patch.name !== undefined) qc.invalidateQueries({ queryKey: queryKeys.conventionsAll() });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(skillPath(id)),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.removeQueries({ queryKey: queryKeys.skill(id) });
      qc.removeQueries({ queryKey: queryKeys.skillUsage(id) });
      qc.removeQueries({ queryKey: queryKeys.skillStats(id) });
      qc.removeQueries({ queryKey: queryKeys.skillVersions(id) });
      // links cascade: skill_count on agent cards and every agent's Skills tab
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      // The server drops a deleted skill's name, so its "in skill" badges go.
      qc.invalidateQueries({ queryKey: queryKeys.conventionsAll() });
    },
  });
}

export interface RestoreSkillVersionVars {
  id: string;
  version: number;
}

/** Restore vN → a NEW version whose body equals vN's. */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: RestoreSkillVersionVars) =>
      api.post<Skill>(`${skillPath(id)}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.skill(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.skillVersions(data.id) });
      qc.invalidateQueries({ queryKey: queryKeys.skillStats(data.id) });
    },
  });
}
