/* hooks/conventions.ts — React Query hooks for the HW2 Conventions Extractor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionSkillDraft,
  ConventionStatus,
  ConventionsView,
  Skill,
  SkillType,
} from "@devdigest/shared";

const SCAN_POLL_MS = 2_000;

/** Latest scan + candidates; polls while a scan is running. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsView>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.scan?.status === "running" ? SCAN_POLL_MS : false),
  });
}

/** Run Scan / Re-scan: starts a background extraction and returns the running scan. */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<{ scan: ConventionScan }>(`/repos/${repoId}/conventions/extract`),
    onSuccess: ({ scan }, repoId) => {
      qc.setQueryData<ConventionsView>(["conventions", repoId], (old) => ({ scan, candidates: old?.candidates ?? [] }));
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

/** What a card may change on a candidate: decision and/or the inline edit. */
export type ConventionPatch = { status?: ConventionStatus; rule?: string; category?: ConventionCategory };

export interface DecideConventionInput {
  repoId: string;
  id: string;
  patch: ConventionPatch;
}

/** Accept / reject / edit one candidate; the list cache is patched in place. */
export function useDecideConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: DecideConventionInput) => api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (row, { repoId }) => {
      qc.setQueryData<ConventionsView>(["conventions", repoId], (old) =>
        old ? { ...old, candidates: old.candidates.map((c) => (c.id === row.id ? row : c)) } : old,
      );
      qc.invalidateQueries({ queryKey: ["convention-skill-draft", repoId] });
    },
  });
}

export function useDeselectConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<{ updated: number }>(`/repos/${repoId}/conventions/deselect`),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      qc.invalidateQueries({ queryKey: ["convention-skill-draft", repoId] });
    },
  });
}

/** The skill the accepted candidates would become; the modal mounts only when it is wanted. */
export function useConventionSkillDraft(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["convention-skill-draft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: !!repoId,
    staleTime: 0,
  });
}

export interface CreateConventionSkillInput {
  repoId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  agent_id: string;
}

export function useCreateConventionSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, ...body }: CreateConventionSkillInput) =>
      api.post<{ skill: Skill; updated_existing: boolean }>(`/repos/${repoId}/conventions/skill`, body),
    onSuccess: ({ skill }, vars) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", skill.id], skill);
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", vars.agent_id] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}
