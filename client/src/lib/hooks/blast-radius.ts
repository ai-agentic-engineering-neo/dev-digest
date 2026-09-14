/* hooks/blast-radius.ts — React Query hook for the Blast Radius tab.
   GET /pulls/:id/blast → changed symbols, their resolved cross-file callers,
   and impacted HTTP endpoints/crons — deterministic, no LLM call. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

/** Mirrors the server's repo-intel `IndexStatus`/`DegradedReason` unions —
    kept local since those types live server-side, not in @devdigest/shared
    (same pattern as hooks/repo-intel.ts's `RepoIntelState`). */
export type BlastIndexStatus = "full" | "partial" | "degraded" | "failed";
export type BlastDegradedReason =
  | "flag_off"
  | "index_failed"
  | "index_partial"
  | "repo_too_large"
  | "no_data";

export interface BlastRadiusResponse {
  status: BlastIndexStatus;
  degradedReason?: BlastDegradedReason;
  data: BlastRadius;
}

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
