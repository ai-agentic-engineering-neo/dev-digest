/* hooks/blast-radius.ts — React Query hook for a PR's Blast Radius: changed
   symbols, their callers, and impacted HTTP endpoints/crons. Deterministic
   and read-only (no LLM call, no mutation) — same shape as hooks/intent.ts's
   read side, minus the compute mutation. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

/** A PR's blast radius, or `undefined` while loading. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast-radius", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
