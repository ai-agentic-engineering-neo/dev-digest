/* hooks/smart-diff.ts — role-grouped Smart Diff for a PR (pure read, keyed by head SHA). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

/** Files grouped by role; refetched when the PR head moves. */
export function useSmartDiff(prId: string | null | undefined, headSha: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId, headSha],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
