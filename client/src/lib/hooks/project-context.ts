/* hooks/project-context.ts — Project Context Folder (SPEC-01): repo docs, one doc's content,
   and an agent's ordered doc attachments per repo (PUT replaces the whole list). */
"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { OWN_ERROR_TOAST } from "../error-message";
import { useResyncRepoIntel } from "./repo-intel";
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

/**
 * Replace the agent's attachments for the repo with `paths` (order = prompt order).
 * Quick toggles/reorders must not race: every click applies its optimistic list at once, but the
 * PUTs run one at a time (`scope`), and only the LAST pending save writes its result / rollback and
 * refetches — an earlier save settling must not overwrite a newer optimistic list, or the next
 * click would compute `paths` from a stale list and silently drop a change.
 */
export function useSetAgentContextDocs(agentId: string, repoId: string) {
  const qc = useQueryClient();
  const key = agentContextDocsKey(agentId, repoId);
  // the settling mutation still counts as pending inside its own callbacks
  const isLastSave = () => qc.isMutating({ mutationKey: key, exact: true }) <= 1;
  return useMutation({
    mutationKey: key,
    scope: { id: `agent-context-docs:${agentId}:${repoId}` },
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
      if (ctx?.prev && isLastSave()) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (saved) => {
      if (isLastSave()) qc.setQueryData(key, saved);
    },
    onSettled: () => {
      if (isLastSave()) qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: contextDocsKey(repoId) }); // attached-agent counts
    },
  });
}

/** Stop polling the doc list this long after a resync started. */
const RESYNC_POLL_TIMEOUT_MS = 60_000;

/** What "the resync changed something" compares: the repo state and the number of docs. */
const signatureOf = (list: ContextDocList | undefined): string | null =>
  list ? `${list.state.status}:${list.docs.length}` : null;

/**
 * Starts a repo resync (fetch + reindex) and polls the doc list every 3 s until its state or doc
 * count differs from the value read FRESH right before the click (a cached list may be stale, so
 * an already-changed value would end polling at once), or until 60 s pass. Shared by the Project
 * Context page and the agent editor's Context tab — a bare `useResyncRepoIntel` never refetches
 * the doc list, so its not-cloned / degraded notice would stay up after a resync.
 */
export function useContextResync(repoId: string) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  // signature before the resync; null = not resyncing
  const [baseline, setBaseline] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const docs = useContextDocs(repoId, { poll: baseline !== null });

  const current = signatureOf(docs.data);
  const finished = baseline !== null && current !== null && current !== baseline;

  useEffect(() => {
    if (finished) setBaseline(null);
  }, [finished]);

  useEffect(() => {
    if (baseline === null) return;
    const id = setTimeout(() => setBaseline(null), RESYNC_POLL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [baseline]);

  async function start() {
    if (starting || baseline !== null || resync.isPending) return;
    setStarting(true);
    try {
      await qc.refetchQueries({ queryKey: contextDocsKey(repoId), exact: true });
      const fresh = signatureOf(qc.getQueryData<ContextDocList>(contextDocsKey(repoId)));
      setBaseline(fresh ?? "");
      resync.mutate(undefined, { onError: () => setBaseline(null) });
    } finally {
      setStarting(false);
    }
  }

  return { start, busy: starting || baseline !== null || resync.isPending };
}
