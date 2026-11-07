/* hooks/blast.ts — blast radius of a PR (changed symbols → callers → endpoints/crons). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBlastRadius } from "../types";

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<PrBlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
