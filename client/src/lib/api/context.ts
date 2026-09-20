/* api/context.ts — Project Context (A3 contract; safe to call once API exposes it). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { SpecFile, IndexStatus } from "@devdigest/shared";

export const contextKeys = {
  list: (repoId: string | null | undefined) => ["context", repoId] as const,
};

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.list(repoId),
    queryFn: () => api.get(`/repos/${repoId}/context`, SpecFile.array()),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post(`/repos/${repoId}/context/reindex`, undefined, IndexStatus),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: contextKeys.list(repoId) }),
  });
}
