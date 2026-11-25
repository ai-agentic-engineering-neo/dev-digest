/* hooks/repos.ts — connected repositories (GET/POST /repos, refresh, delete). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Repo } from "../types";
import { pullKeys, repoKeys } from "./keys";

export function useRepos() {
  return useQuery({
    queryKey: repoKeys.all,
    queryFn: () => api.get<Repo[]>("/repos"),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.all }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<Repo>(`/repos/${repoId}/refresh`),
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
