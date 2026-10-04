/* hooks/blast.ts — the PR blast radius (changed symbols → downstream callers/endpoints/crons).
   GET /pulls/:id/blast → BlastRadiusResponse (degraded + reason when the index is unusable). */
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useResyncRepoIntel } from "./repo-intel";
import type { BlastRadiusResponse } from "@devdigest/shared";

export const blastKeys = {
  /** Prefix key: matches every headSha of this PR. */
  pr: (prId: string | null | undefined) => ["pr-blast", prId] as const,
  prAt: (prId: string | null | undefined, headSha: string | null | undefined) =>
    ["pr-blast", prId, headSha] as const,
};

/** headSha is part of the key so a moved PR head refetches instead of showing stale callers. */
export function usePrBlast(prId: string | null | undefined, headSha: string | null | undefined) {
  return useQuery({
    queryKey: blastKeys.prAt(prId, headSha),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** Repo resync that also refreshes this PR's blast radius once the resync is accepted. */
export function useResyncBlast(repoId: string | null | undefined, prId: string | null | undefined) {
  const qc = useQueryClient();
  const mutation = useResyncRepoIntel(repoId);
  const { mutate } = mutation;
  const resync = () =>
    mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: blastKeys.pr(prId) }) });
  return { ...mutation, resync };
}
