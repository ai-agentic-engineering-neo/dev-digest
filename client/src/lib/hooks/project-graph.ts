/* hooks/project-graph.ts — React Query hooks for the Project Graph tab
   (specs/18-dependency-graph.md). Every response carries an explicit `state`
   (empty | reindexing | ready), so callers branch on it instead of guessing. */
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ProjectGraph,
  ProjectGraphFiles,
  ProjectGraphFileSort,
  ProjectGraphSymbols,
  ProjectGraphUnresolved,
} from "@devdigest/shared";

function qs(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** `dir` and `file` are mutually exclusive (server answers 422 otherwise). */
export function useProjectGraph(repoId: string | undefined, focus: { dir?: string | null; file?: string | null }) {
  return useQuery({
    queryKey: ["project-graph", repoId, focus.dir ?? null, focus.file ?? null],
    queryFn: () =>
      api.get<ProjectGraph>(`/repos/${repoId}/graph${qs({ dir: focus.dir, file: focus.file })}`),
    enabled: !!repoId,
  });
}

export function useProjectGraphFiles(
  repoId: string | undefined,
  opts: { dir?: string | null; page: number; sort: ProjectGraphFileSort; enabled?: boolean },
) {
  return useQuery({
    queryKey: ["project-graph-files", repoId, opts.dir ?? null, opts.page, opts.sort],
    queryFn: () =>
      api.get<ProjectGraphFiles>(
        `/repos/${repoId}/graph/files${qs({ dir: opts.dir, page: opts.page, sort: opts.sort })}`,
      ),
    enabled: !!repoId && opts.enabled !== false,
    placeholderData: keepPreviousData,
  });
}

export function useProjectGraphUnresolved(
  repoId: string | undefined,
  opts: { page: number; enabled?: boolean },
) {
  return useQuery({
    queryKey: ["project-graph-unresolved", repoId, opts.page],
    queryFn: () => api.get<ProjectGraphUnresolved>(`/repos/${repoId}/graph/unresolved${qs({ page: opts.page })}`),
    enabled: !!repoId && opts.enabled !== false,
    placeholderData: keepPreviousData,
  });
}

export function useProjectGraphSymbols(
  repoId: string | undefined,
  opts: { file: string | null; page: number },
) {
  return useQuery({
    queryKey: ["project-graph-symbols", repoId, opts.file, opts.page],
    queryFn: () =>
      api.get<ProjectGraphSymbols>(`/repos/${repoId}/graph/symbols${qs({ file: opts.file, page: opts.page })}`),
    enabled: !!repoId && !!opts.file,
    placeholderData: keepPreviousData,
  });
}
