/* hooks/smart-diff.ts — React Query hook for the L03 Smart Order feature.
   Not re-exported from hooks/index.ts (frontend-ui-architecture §11 forbids
   `export *` barrels growing without bound) — import this file directly:
   `import { useSmartDiff } from "@/lib/hooks/smart-diff"`, same precedent as
   `hooks/intent.ts`. */
"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

/** Role-classified files + size/split suggestion for a PR. Only fetched in
    Smart mode — pass `null` in Original mode so the query stays disabled. */
export function useSmartDiff(
  prId: string | null | undefined,
): UseQueryResult<SmartDiffResponse> {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
