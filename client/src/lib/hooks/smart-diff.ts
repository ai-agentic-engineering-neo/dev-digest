/* hooks/smart-diff.ts — deterministic role-grouped diff for a PR. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "../types";

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
