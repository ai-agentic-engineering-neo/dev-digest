/* hooks/conventions.ts — React Query hooks for the Conventions screen: the scan,
   the per-candidate decisions, and the skill the accepted ones become. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionStatus,
  ConventionsPage,
  ConventionsSkillPreview,
  Skill,
  SkillType,
} from "@devdigest/shared";

/** How often the page re-asks while a scan is in flight. */
const SCAN_POLL_MS = 2000;

/**
 * The whole screen in one query: the latest scan and every candidate.
 *
 * Polls itself only while the scan is `running`. The scan is a job, so there is
 * no stream to subscribe to and no completion event — the row changing status
 * IS the event.
 */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsPage>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      query.state.data?.scan?.status === "running" ? SCAN_POLL_MS : false,
  });
}

export function useRunConventionScan(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ scan_id: string }>(`/repos/${repoId}/conventions/extract`),
    // Refetch immediately: the page has to flip to "scanning" before the poll
    // interval would otherwise notice.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface UpdateCandidateInput {
  id: string;
  patch: {
    status?: ConventionStatus;
    rule?: string;
    category?: ConventionCategory;
    confidence?: number;
  };
}

export function useUpdateCandidate(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateCandidateInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export function usePreviewConventionsSkill(repoId: string | null | undefined) {
  return useMutation({
    mutationFn: (candidateIds: string[]) =>
      api.post<ConventionsSkillPreview>(`/repos/${repoId}/conventions/skill/preview`, {
        candidate_ids: candidateIds,
      }),
  });
}

export interface CreateConventionsSkillInput {
  candidate_ids: string[];
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  agent_id?: string;
}

export function useCreateConventionsSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionsSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      // Three lists change at once: the candidates now carry a skill id, the
      // Skills screen has a new card, and every agent's skill count may have
      // moved.
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
