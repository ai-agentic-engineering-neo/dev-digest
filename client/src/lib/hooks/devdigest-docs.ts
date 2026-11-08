/* hooks/devdigest-docs.ts — user-owned `.devdigest/specs/` docs (SPEC-03): list, one doc, and the
   create / upload / copy / save / delete mutations. Callers show errors inline (OWN_ERROR_TOAST). */
"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { OWN_ERROR_TOAST } from "../error-message";
import { contextDocsKey } from "./project-context";
import type {
  DevdigestCopyResult,
  DevdigestDeleteResult,
  DevdigestDoc,
  DevdigestDocList,
} from "../types";

export const devdigestDocsKey = (repoId: string) => ["devdigest-docs", repoId] as const;
export const devdigestDocKey = (id: string | null) => ["devdigest-doc", id] as const;

/** The doc list (tree) and the context-docs list (agent tab) both show tokens/paths. */
function invalidateLists(qc: QueryClient, repoId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: devdigestDocsKey(repoId) }),
    qc.invalidateQueries({ queryKey: contextDocsKey(repoId) }),
  ]);
}

/** A repo's `.devdigest` docs plus the page footer/notice data. */
export function useDevdigestDocs(repoId: string) {
  return useQuery({
    queryKey: devdigestDocsKey(repoId),
    queryFn: () => api.get<DevdigestDocList>(`/repos/${repoId}/devdigest-docs`),
    enabled: !!repoId,
  });
}

/** One `.devdigest` doc with its content and attached agents. */
export function useDevdigestDoc(id: string | null) {
  return useQuery({
    queryKey: devdigestDocKey(id),
    queryFn: () => api.get<DevdigestDoc>(`/devdigest-docs/${id}`),
    enabled: !!id,
    retry: false,
  });
}

export function useCreateDevdigestDoc(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: OWN_ERROR_TOAST,
    mutationFn: (body: { folder: string; name: string }) =>
      api.post<DevdigestDoc>(`/repos/${repoId}/devdigest-docs`, body),
    onSuccess: async (doc) => {
      qc.setQueryData(devdigestDocKey(doc.id), doc);
      await invalidateLists(qc, repoId);
    },
  });
}

export function useUploadDevdigestDoc(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: OWN_ERROR_TOAST,
    mutationFn: (body: { folder: string; filename: string; content_base64: string; overwrite: boolean }) =>
      api.post<DevdigestDoc>(`/repos/${repoId}/devdigest-docs/uploads`, body),
    onSuccess: async (doc) => {
      qc.setQueryData(devdigestDocKey(doc.id), doc);
      await invalidateLists(qc, repoId);
    },
  });
}

export function useCopyDevdigestDoc(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: OWN_ERROR_TOAST,
    mutationFn: (body: { source_path: string }) =>
      api.post<DevdigestCopyResult>(`/repos/${repoId}/devdigest-docs/copies`, body),
    onSuccess: async (result) => {
      qc.setQueryData(devdigestDocKey(result.doc.id), result.doc);
      if (result.created) await invalidateLists(qc, repoId);
    },
  });
}

export function useSaveDevdigestDoc(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: OWN_ERROR_TOAST,
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.put<DevdigestDoc>(`/devdigest-docs/${id}`, { content }),
    onSuccess: async (saved, { id }) => {
      qc.setQueryData(devdigestDocKey(id), saved);
      await invalidateLists(qc, repoId);
    },
  });
}

export function useDeleteDevdigestDoc(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: OWN_ERROR_TOAST,
    mutationFn: ({ id }: { id: string }) => api.del<DevdigestDeleteResult>(`/devdigest-docs/${id}`),
    onSuccess: async (_result, { id }) => {
      qc.removeQueries({ queryKey: devdigestDocKey(id) });
      await Promise.all([
        invalidateLists(qc, repoId),
        // attachments were detached for every agent
        qc.invalidateQueries({ queryKey: ["agent-context-docs"] }),
      ]);
    },
  });
}
