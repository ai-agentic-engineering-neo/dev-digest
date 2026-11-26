/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (/repos/:repoId/conventions): list, scan, triage, skill draft + create. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConventionCandidate,
  ConventionScanResult,
  ConventionSkillDraft,
  ConventionSkillResult,
  ConventionsPage,
  CreateSkillFromConventionsInput,
  UpdateConventionInput,
} from "@devdigest/shared";
import { queryKeys } from "./keys";
import { api } from "../api";
import { isUuid, repoPath } from "../ids";

const conventionPath = (id: string) => `/conventions/${encodeURIComponent(id)}`;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conventions(repoId),
    queryFn: () => api.get<ConventionsPage>(`${repoPath(repoId)}/conventions`),
    enabled: isUuid(repoId),
  });
}

/** Re-scan (one model call). The reply also seeds the list cache; its counters
    stay on `mutation.data` for the "nothing found" banner. */
export function useScanConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionScanResult>(`${repoPath(repoId)}/conventions/scan`),
    onSuccess: (data) => {
      const page: ConventionsPage = { scan: data.scan, candidates: data.candidates };
      qc.setQueryData(queryKeys.conventions(repoId), page);
    },
  });
}

export interface UpdateConventionVars {
  id: string;
  patch: UpdateConventionInput;
}

/** Accept / reject / edit one convention; the reply replaces it in the list cache. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionVars) =>
      api.patch<ConventionCandidate>(conventionPath(id), patch),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionsPage>(queryKeys.conventions(repoId), (prev) =>
        prev
          ? { ...prev, candidates: prev.candidates.map((c) => (c.id === updated.id ? updated : c)) }
          : prev,
      );
    },
  });
}

/** Preview of the skill the selected conventions make (POST, writes nothing). */
export function useConventionSkillDraft(
  repoId: string,
  conventionIds: readonly string[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.conventionSkillDraft(repoId, conventionIds),
    queryFn: () =>
      api.post<ConventionSkillDraft>(`${repoPath(repoId)}/conventions/skill-draft`, {
        convention_ids: conventionIds,
      }),
    enabled: enabled && conventionIds.length > 0 && isUuid(repoId),
  });
}

/** Input as the modal sends it: server defaults (type, enabled) may be left out. */
export type CreateSkillFromConventionsBody = Partial<CreateSkillFromConventionsInput> &
  Pick<CreateSkillFromConventionsInput, "convention_ids" | "name">;

export function useCreateSkillFromConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsBody) =>
      api.post<ConventionSkillResult>(`${repoPath(repoId)}/conventions/skill`, input),
    onSuccess: ({ skill }) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.conventions(repoId) });
      qc.setQueryData(queryKeys.skill(skill.id), skill);
    },
  });
}
