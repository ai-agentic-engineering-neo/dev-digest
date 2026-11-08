/* hooks/project-context.ts — Project Context Folder (SPEC-01): repo docs, one doc's content,
   and an agent's ordered doc attachments per repo (PUT replaces the whole list). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { OWN_ERROR_TOAST } from "../error-message";
import type { AgentContextDocs, ContextDocContent, ContextDocList } from "../types";

const POLL_MS = 3000;

export const contextDocsKey = (repoId: string | null | undefined) => ["context-docs", repoId] as const;
export const agentContextDocsKey = (agentId: string, repoId: string | null | undefined) =>
  ["agent-context-docs", agentId, repoId] as const;

/** Markdown docs of a repo at the last synced commit; `poll` refetches every 3 s (after a resync). */
export function useContextDocs(repoId: string | null | undefined, opts?: { poll?: boolean }) {
  return useQuery({
    queryKey: contextDocsKey(repoId),
    queryFn: () => api.get<ContextDocList>(`/repos/${repoId}/context-docs`),
    enabled: !!repoId,
    refetchInterval: opts?.poll ? POLL_MS : false,
  });
}

/** One doc's content + meta. */
export function useContextDoc(repoId: string | null | undefined, path: string | null) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context-docs/content?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
    retry: false,
  });
}

/** Ordered docs an agent reads for a repo. */
export function useAgentContextDocs(agentId: string, repoId: string | null | undefined) {
  return useQuery({
    queryKey: agentContextDocsKey(agentId, repoId),
    queryFn: () =>
      api.get<AgentContextDocs>(`/agents/${agentId}/context-docs?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Replace the agent's attachments for the repo with `paths` (order = prompt order). */
export function useSetAgentContextDocs(agentId: string, repoId: string) {
  const qc = useQueryClient();
  const key = agentContextDocsKey(agentId, repoId);
  return useMutation({
    meta: OWN_ERROR_TOAST,
    mutationFn: (paths: string[]) =>
      api.put<AgentContextDocs>(`/agents/${agentId}/context-docs`, { repo_id: repoId, paths }),
    onMutate: async (paths) => {
      // optimistic: toggles / reorder feel instant; status/meta are reused from the known rows
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentContextDocs>(key);
      const known = new Map((prev?.docs ?? []).map((d) => [d.path, d]));
      const list = qc.getQueryData<ContextDocList>(contextDocsKey(repoId));
      const listed = new Map((list?.docs ?? []).map((d) => [d.path, d]));
      qc.setQueryData<AgentContextDocs>(key, {
        agent_id: agentId,
        repo_id: repoId,
        docs: paths.map((path, position) => {
          const k = known.get(path);
          if (k) return { ...k, position };
          const l = listed.get(path);
          return l
            ? { path, position, status: "ok", source: l.source, tokens: l.tokens }
            : { path, position, status: "missing", source: null, tokens: null };
        }),
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (saved) => {
      qc.setQueryData(key, saved);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: contextDocsKey(repoId) }); // attached-agent counts
    },
  });
}
