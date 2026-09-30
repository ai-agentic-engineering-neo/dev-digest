/* hooks/pr-history.ts — React Query hook for "prior PRs that touched the
   same files as this one." Deterministic (file-path overlap over pr_files),
   no LLM call — same shape as hooks/blast-radius.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrHistory } from "@devdigest/shared";

export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
  });
}
