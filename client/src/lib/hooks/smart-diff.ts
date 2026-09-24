/* hooks/smart-diff.ts — server/specs/06-smart-diff.md: GET /pulls/:id/smart-diff.
   Files grouped by role + the newest review's finding lines; no model call. */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { SmartDiffResponse } from "@devdigest/shared";
import { api } from "../api";
import { prKeys } from "./keys";

/** GET /pulls/:id/smart-diff. */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: prKeys.smartDiff(prId),
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
