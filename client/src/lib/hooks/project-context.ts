/* hooks/project-context.ts — React Query hooks for Project Context (SPEC-01):
   the repo's document listing, one document's text, and the documents an
   agent or a skill attaches, plus saving and resetting a document's local
   override. Mutations toast globally (providers.tsx). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ContextAttachment, ContextFileContent, SpecFile } from "@devdigest/shared";

export type ContextOwnerKind = "agent" | "skill";

const PLURAL: Record<ContextOwnerKind, string> = { agent: "agents", skill: "skills" };

/** Documents of the repo's default branch (`GET /repos/:id/context`). */
export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** Re-list the repo bypassing the server's per-head-sha cache (the toolbar's refresh icon). */
export function useRefreshContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.get<SpecFile[]>(`/repos/${repoId}/context?refresh=true`),
    onSuccess: (files, repoId) => qc.setQueryData(["context", repoId], files),
  });
}

/** Text of one listed document (`GET /repos/:id/context/file?path=`). */
export function useContextFile(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-file", repoId, path],
    queryFn: () => api.get<ContextFileContent>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}

/** After a save or reset: the file cache takes the server's answer, the listing refetches (row marker, tokens). */
function useOverrideMutation(run: (repoId: string, path: string, text: string) => Promise<ContextFileContent>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, path, text }: { repoId: string; path: string; text: string }) => run(repoId, path, text),
    onSuccess: (data, { repoId, path }) => {
      qc.setQueryData(["context-file", repoId, path], data);
      qc.invalidateQueries({ queryKey: ["context", repoId] });
    },
  });
}

/** Save the local override of a document (`PUT /repos/:id/context/file`). */
export function useSaveContextFile() {
  return useOverrideMutation((repoId, path, text) => api.put<ContextFileContent>(`/repos/${repoId}/context/file`, { path, text }));
}

/** Drop the override, back to the repository version (`DELETE /repos/:id/context/file?path=`). */
export function useResetContextFile() {
  return useOverrideMutation((repoId, path) =>
    api.del<ContextFileContent>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path)}`),
  );
}

function ownerKey(kind: ContextOwnerKind, id: string, repoId: string) {
  return ["context-attachments", kind, id, repoId];
}

/** Attached paths of an agent or skill for one repo, in stored order. */
export function useContextAttachments(kind: ContextOwnerKind, id: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ownerKey(kind, id ?? "", repoId ?? ""),
    queryFn: () => api.get<ContextAttachment[]>(`/${PLURAL[kind]}/${id}/context?repo_id=${repoId}`),
    enabled: !!id && !!repoId,
  });
}

/**
 * Replace the ordered attached set. The cache is written optimistically and
 * rolled back when the server rejects it; for an agent a changed set also bumps
 * its version, so the agent queries are refreshed.
 */
export function useSetContextAttachments(kind: ContextOwnerKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, repoId, paths }: { id: string; repoId: string; paths: string[] }) =>
      api.put<ContextAttachment[]>(`/${PLURAL[kind]}/${id}/context`, { repo_id: repoId, paths }),
    onMutate: async ({ id, repoId, paths }) => {
      const key = ownerKey(kind, id, repoId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ContextAttachment[]>(key);
      const known = new Map((previous ?? []).map((a) => [a.path, a]));
      qc.setQueryData<ContextAttachment[]>(
        key,
        paths.map((path, order) => ({ path, order, missing: known.get(path)?.missing ?? false, too_large: known.get(path)?.too_large ?? false })),
      );
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSuccess: (saved, { id, repoId }) => {
      qc.setQueryData(ownerKey(kind, id, repoId), saved);
      qc.invalidateQueries({ queryKey: ["context", repoId] });
      if (kind === "agent") {
        qc.invalidateQueries({ queryKey: ["agent", id] });
        qc.invalidateQueries({ queryKey: ["agents"] });
      }
    },
  });
}
