/* hooks/context.ts — React Query hooks for Project Context: the repo's
   discovered markdown documents, one document's preview, and the ordered paths
   attached to an agent or a skill. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentContext, ContextDocumentDetail, ContextList } from "@devdigest/shared";

export function useContextDocuments(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ContextList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
    // A missing clone is a steady state, not a transient failure.
    retry: (count, err) => (err as { code?: string })?.code !== "repo_not_cloned" && count < 2,
  });
}

export function useContextDocument(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId, "file", path],
    queryFn: () =>
      api.get<ContextDocumentDetail>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<AgentContext>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

export function useSetAgentContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, paths }: { agentId: string; paths: string[] }) =>
      api.put<AgentContext>(`/agents/${agentId}/context`, { paths }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-context", agentId], data);
      // Version bumped + "Used by" counts changed.
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["context"] });
    },
  });
}

export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<{ paths: string[] }>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

export function useSetSkillContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, paths }: { skillId: string; paths: string[] }) =>
      api.put<{ paths: string[] }>(`/skills/${skillId}/context`, { paths }),
    onSuccess: (data, { skillId }) => {
      qc.setQueryData(["skill-context", skillId], data);
      qc.invalidateQueries({ queryKey: ["skill", skillId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["context"] });
      // Agents linking this skill now inherit a different set.
      qc.invalidateQueries({ queryKey: ["agent-context"] });
    },
  });
}
