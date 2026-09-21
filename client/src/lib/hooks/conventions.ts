/* hooks/conventions.ts — React Query hooks for the Conventions extractor.
   A candidate is a PROPOSED house-rule with code-verified evidence: the user accepts
   or rejects each one, and the accepted set becomes the `repo-conventions` skill. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionExtractResult,
  ConventionSkillBody,
  ConventionSkillDraft,
  ConventionSkillResult,
  ConventionStatus,
} from "@devdigest/shared";

/** Persisted candidates (pending + accepted; the server omits rejected ones). */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run a scan (Run Scan / ReScan). Costs one model call, so it is a mutation,
 * never a query: it must not re-run on a refocus. The response already contains
 * the whole board, so it seeds the list cache instead of triggering a refetch.
 */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`, {}),
    onSuccess: (data, repoId) => {
      qc.setQueryData(["conventions", repoId], data.candidates);
      qc.invalidateQueries({ queryKey: ["convention-skill-draft", repoId] });
    },
  });
}

export interface UpdateConventionInput {
  repoId: string;
  id: string;
  patch: {
    status?: ConventionStatus;
    rule?: string;
    rationale?: string | null;
    category?: ConventionCategory;
  };
}

/** Accept / reject / edit. A rejected candidate leaves the board (the server hides it too). */
export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated, { repoId }) => {
      qc.setQueryData<ConventionCandidate[]>(["conventions", repoId], (prev) =>
        updated.status === "rejected"
          ? prev?.filter((c) => c.id !== updated.id)
          : prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
      qc.invalidateQueries({ queryKey: ["convention-skill-draft", repoId] });
    },
  });
}

/**
 * The un-persisted skill draft built from the ACCEPTED candidates. Fetched fresh
 * each time the Create-skill modal opens (no cache reuse, so the body never
 * reflects a stale accepted set).
 */
export function useConventionSkillDraft(repoId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["convention-skill-draft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: !!repoId && enabled,
    gcTime: 0,
    retry: false,
  });
}

/**
 * Persist the (user-edited) draft: the server upserts the `repo-conventions` skill
 * (a second save adds a version) and links it additively to the chosen agent.
 */
export function useCreateConventionSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, body }: { repoId: string; body: ConventionSkillBody }) =>
      api.post<ConventionSkillResult>(`/repos/${repoId}/conventions/skill`, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill", data.skill.id] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.skill.id] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}
