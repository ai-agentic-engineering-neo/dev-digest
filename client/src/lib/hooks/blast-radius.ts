/* hooks/blast-radius.ts — React Query hook for the Blast Radius card.
   GET /pulls/:id/blast?depth=&include_type_only= → changed symbols, resolved
   callers, impacted endpoints/crons plus the specs/18 graph, index, overlay
   and reindexing fields — deterministic, no LLM call. */
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  BlastRadius,
  BlastGraph,
  BlastIndexInfo,
  IndexReindexing,
  OverlayInfo,
} from "@devdigest/shared";

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
  /** specs/18 additive fields — optional so older payloads keep rendering. */
  index?: BlastIndexInfo;
  overlay?: OverlayInfo;
  graph?: BlastGraph;
  reindexing?: IndexReindexing | null;
}

export interface BlastRadiusOptions {
  depth?: number;
  /** Server default is true; only `false` is ever sent. */
  includeTypeOnly?: boolean;
}

/** Query string for the blast endpoint — defaults are omitted. */
export function blastPath(prId: string, { depth, includeTypeOnly }: BlastRadiusOptions = {}): string {
  const params = new URLSearchParams();
  if (depth != null) params.set("depth", String(depth));
  if (includeTypeOnly === false) params.set("include_type_only", "false");
  const qs = params.toString();
  return `/pulls/${prId}/blast${qs ? `?${qs}` : ""}`;
}

export function useBlastRadius(prId: string | null | undefined, options: BlastRadiusOptions = {}) {
  const { depth, includeTypeOnly = true } = options;
  return useQuery({
    queryKey: ["blast-radius", prId, depth ?? null, includeTypeOnly],
    queryFn: () => api.get<BlastRadiusResponse>(blastPath(prId as string, { depth, includeTypeOnly })),
    enabled: !!prId,
    placeholderData: keepPreviousData,
  });
}
