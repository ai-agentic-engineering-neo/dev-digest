/* hooks/project-context.ts — React Query hooks for the Project Context Folder
   feature (specs/09-project-context-folder.md): the repo-scoped document
   browser plus agent/skill attachment, mirroring hooks/agents.ts's
   skill-link shape (checkbox = PUT one, drag = POST the whole ordered set).

   Discovery (`useRepoDocuments`) intentionally carries no `staleTime` — the
   server does no caching either (Q7: "no cache", refresh = call the endpoint
   again), so React Query's default (always refetch on mount/refocus) is the
   correct behaviour here, not an oversight. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AttachedDocument, DocumentContent, DocumentList } from "@devdigest/shared";

/** The two entities a set of context documents can be attached to — an
 *  agent directly, or a skill (inherited by every agent that enables it,
 *  AC-11/AC-12). The mutation/query hooks below are parameterized by this
 *  rather than duplicated per entity: the two REST resources
 *  (`/agents/:id/documents`, `/skills/:id/documents`) differ only in this
 *  one path segment and the id field name their caller supplies. */
export type ContextAttachmentEntity = "agent" | "skill";

export const projectContextKeys = {
  documents: (repoId: string | null | undefined) => ["repo-documents", repoId] as const,
  document: (repoId: string | null | undefined, path: string | null | undefined) =>
    ["repo-document", repoId, path] as const,
  entityDocuments: (entity: ContextAttachmentEntity, id: string | null | undefined) =>
    [`${entity}-documents`, id] as const,
};

/** Discovery listing for the Project Context page (AC-1, AC-2, AC-20, AC-29,
 *  AC-38) — roots, every discovered document, and the summary. */
export function useRepoDocuments(repoId: string | null | undefined) {
  return useQuery({
    queryKey: projectContextKeys.documents(repoId),
    queryFn: () => api.get<DocumentList>(`/repos/${repoId}/context/documents`),
    enabled: !!repoId,
  });
}

/** Read-only content preview for one selected document (AC-4) — never fetched
 *  until a document is actually selected. */
export function useDocument(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: projectContextKeys.document(repoId, path),
    queryFn: () =>
      api.get<DocumentContent>(
        `/repos/${repoId}/context/documents/one?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/**
 * Set a repo's search roots (Q1/Q2, US-8/AC-29). The route returns only the
 * roots it stored, not a refreshed listing, so the discovery query is
 * invalidated to re-scan under the new roots rather than patched in place.
 */
export function useSetDocRoots(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docRoots: string[]) =>
      api.put<{ doc_roots: string[] }>(`/repos/${repoId}/context/config`, { doc_roots: docRoots }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectContextKeys.documents(repoId) });
    },
  });
}

/**
 * An entity's (agent's or skill's) attached documents — includes
 * detached-but-kept rows (order survives an off/on cycle, AC-10) and each
 * one's present/missing status (AC-26). For a skill, every agent with it
 * enabled inherits these (AC-11, AC-12).
 */
export function useEntityDocuments(entity: ContextAttachmentEntity, id: string | null | undefined) {
  return useQuery({
    queryKey: projectContextKeys.entityDocuments(entity, id),
    queryFn: () => api.get<AttachedDocument[]>(`/${entity}s/${id}/documents`),
    enabled: !!id,
  });
}

/**
 * Set/reorder an entity's whole ordered attachment set (drag-to-reorder,
 * AC-9). `documents` REPLACES the set: an attached document omitted from the
 * payload is detached, not deleted. A GET already in flight when the drag
 * settles must not be allowed to land after `onSuccess` and overwrite the
 * just-written order, so the in-flight query is cancelled first.
 */
export function useSetEntityDocuments(entity: ContextAttachmentEntity) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      documents,
    }: {
      id: string;
      documents: { repo_id: string; path: string }[];
    }) => api.post<AttachedDocument[]>(`/${entity}s/${id}/documents`, { documents }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: projectContextKeys.entityDocuments(entity, id) });
    },
    onSuccess: (docs, { id }) => {
      qc.setQueryData(projectContextKeys.entityDocuments(entity, id), docs);
    },
  });
}

/**
 * Attach/detach exactly ONE document without touching its position (AC-8,
 * AC-10) — the Context tab checkbox.
 */
export function useSetEntityDocumentAttached(entity: ContextAttachmentEntity) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      repoId,
      path,
      attached,
    }: {
      id: string;
      repoId: string;
      path: string;
      attached: boolean;
    }) =>
      api.put<AttachedDocument[]>(`/${entity}s/${id}/documents`, {
        repo_id: repoId,
        path,
        attached,
      }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: projectContextKeys.entityDocuments(entity, id) });
    },
    onSuccess: (docs, { id }) => {
      qc.setQueryData(projectContextKeys.entityDocuments(entity, id), docs);
    },
  });
}
