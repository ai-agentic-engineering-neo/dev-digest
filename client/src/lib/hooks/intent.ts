/* hooks/intent.ts — derived PR intent: read, re-derive, save a user override, reset.
   Every mutation writes the returned entity into the cache BEFORE invalidating, so the card
   updates without a reload. Failures are toasted by the global MutationCache handler. */
"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { IntentOverrideInput, PrDetail, PrIntent } from "../types";

export const prIntentKey = (prId: string) => ["pr-intent", prId] as const;

/** How often the intent is re-read while a review runs (it is derived at the start of the run). */
export const INTENT_LIVE_POLL_MS = 4000;

/** `live` = a review is running for this PR: poll so the card fills in as soon as the run derives it. */
export function usePrIntent(prId: string | null | undefined, opts: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntent | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    refetchInterval: opts.live ? INTENT_LIVE_POLL_MS : false,
  });
}

/** Re-reads the intent once every time the PR's reviews go from running to settled, whichever tab is
    open (the Findings tab's own run-done callback only fires while that tab is mounted). */
export function useRefreshIntentWhenRunsSettle(prId: string | null | undefined, reviewRunning: boolean) {
  const qc = useQueryClient();
  const wasRunning = useRef(reviewRunning);
  useEffect(() => {
    if (wasRunning.current && !reviewRunning && prId) {
      qc.invalidateQueries({ queryKey: prIntentKey(prId) });
    }
    wasRunning.current = reviewRunning;
  }, [prId, reviewRunning, qc]);
}

function useWriteIntentCache(prId: string) {
  const qc = useQueryClient();
  return (res: PrIntent | null) => {
    qc.setQueryData<PrIntent | null>(prIntentKey(prId), res);
    qc.invalidateQueries({ queryKey: prIntentKey(prId) });
  };
}

/** Re-derives the intent. The intent is computed from the PR as stored in our DB, and the DB copy of
    the PR body is only re-synced from GitHub by GET /pulls/:id — so read that first (a just-edited
    description is picked up and the Description section updates too). A failed sync is not fatal:
    the server still derives from the stored PR. */
export function useRefreshIntent(prId: string) {
  const qc = useQueryClient();
  const write = useWriteIntentCache(prId);
  return useMutation({
    mutationFn: async () => {
      const detail = await api.get<PrDetail>(`/pulls/${prId}`).catch(() => null);
      if (detail) qc.setQueryData<PrDetail>(["pull", prId], detail);
      return api.post<PrIntent>(`/pulls/${prId}/intent/refresh`);
    },
    onSuccess: write,
  });
}

export function useSaveIntentOverride(prId: string) {
  const write = useWriteIntentCache(prId);
  return useMutation({
    mutationFn: (input: IntentOverrideInput) => api.put<PrIntent>(`/pulls/${prId}/intent`, input),
    onSuccess: write,
  });
}

export function useResetIntent(prId: string) {
  const write = useWriteIntentCache(prId);
  return useMutation({
    mutationFn: () => api.del<PrIntent | null>(`/pulls/${prId}/intent`),
    onSuccess: write,
  });
}
