/* hooks/intent.ts — L03 Intent layer (specs/05-intent-layer.md).
   Read side rides the existing pull-detail cache (no extra round trip);
   the recompute side is a standalone POST that bypasses waiting for a full
   review run. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { IntentDetail, PrDetail } from "@devdigest/shared";

export interface Intent {
  summary: string | null;
  inScope: string[] | null;
  outOfScope: string[] | null;
  contextGaps: string[] | null;
  signals: string[] | null;
}

type IntentFields = Pick<
  PrDetail,
  "intent" | "intent_in_scope" | "intent_out_of_scope" | "intent_context_gaps" | "intent_signals"
>;

function toIntent(pr: IntentFields): Intent {
  return {
    summary: pr.intent ?? null,
    inScope: pr.intent_in_scope ?? null,
    outOfScope: pr.intent_out_of_scope ?? null,
    contextGaps: pr.intent_context_gaps ?? null,
    signals: pr.intent_signals ?? null,
  };
}

/** A PR's cached intent fields — same query key/fetcher as `usePullDetail`
   (`lib/hooks/core.ts`), so this shares its cache entry rather than issuing a
   second `GET /pulls/:id`; `select` narrows it to just what IntentCard needs. */
export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pull", prId],
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
    select: toIntent,
  });
}

/** Manual, on-demand intent recompute (POST /pulls/:id/intent/recalculate) —
   for a user who wants a fresh read without running a full agent review.
   Invalidates the pull-detail query on success so every reader of it
   (this hook included) picks up the new value. */
export function useRecalculateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IntentDetail>(`/pulls/${prId}/intent/recalculate`),
    onSuccess: () => {
      if (prId) qc.invalidateQueries({ queryKey: ["pull", prId] });
    },
  });
}
