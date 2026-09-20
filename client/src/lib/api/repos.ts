/* api/repos.ts — Repos (F1: GET/POST /repos, refresh, delete). */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { Repo } from "@devdigest/shared";
import { pullKeys } from "./pulls";

export const repoKeys = {
  all: ["repos"] as const,
};

export function useRepos() {
  return useQuery({
    queryKey: repoKeys.all,
    queryFn: () => api.get("/repos", Repo.array()),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post("/repos", { url }, Repo),
    onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.all }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post(`/repos/${repoId}/refresh`, undefined, Repo),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: repoKeys.all });
      qc.invalidateQueries({ queryKey: pullKeys.list(repoId) });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del<{ deleted: string }>(`/repos/${repoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.all }),
  });
}
