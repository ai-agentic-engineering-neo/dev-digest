/* hooks/skill-stats.ts — React Query hook for the Skills page Stats tab. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SkillStats } from "@devdigest/shared";

export function useSkillStats(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", skillId],
    queryFn: () => api.get<SkillStats>(`/skills/${skillId}/stats`),
    enabled: !!skillId,
  });
}
