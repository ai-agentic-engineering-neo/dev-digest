/* hooks/ci.ts — React Query hooks for Export to CI + CI Runs
   (specs/14-export-to-ci.md).

   AC-25 — every read here is stored rows only, zero provider calls; the
   ONLY hook that ever reaches the CI provider is `useRefreshCiRuns`
   (POST /ci/refresh), and only when the user (or the 30s auto-refresh
   interval) triggers it. AC-29 — `useCiRuns`'s `refetchInterval: 30_000`
   plus react-query's own `refetchIntervalInBackground: false` default is
   what suspends polling while the page is hidden; no manual
   `visibilitychange` listener needed. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetch, API_BASE } from "../api";
import type {
  CiExport,
  CiExportInputBody,
  CiInstallation,
  CiPreview,
  CiRefreshResult,
  CiRunsPage,
  CiSecretStatus,
  CiTargetOption,
} from "@devdigest/shared/contracts/eval-ci";

/** `GET /agents/:id/ci/installations` — CI tab list row (AC-36). Not a
 *  separately named shared contract; mirrors `CiService.listInstallationsForAgent`'s
 *  response shape 1:1. */
export interface CiInstallationListItem extends CiInstallation {
  last_run_status: string | null;
  last_run_at: string | null;
}

export interface CiRunFiltersInput {
  from?: string;
  to?: string;
  agent_id?: string;
  repo?: string;
  status?: string;
  source?: string;
}

export const ciKeys = {
  targets: () => ["ci-targets"] as const,
  preview: (agentId: string | null | undefined, input: CiExportInputBody) =>
    ["ci-preview", agentId, input] as const,
  installations: (agentId: string | null | undefined) => ["ci-installations", agentId] as const,
  secrets: (agentId: string | null | undefined, repo: string) =>
    ["ci-secrets", agentId, repo] as const,
  runs: (filters: CiRunFiltersInput) => ["ci-runs", filters] as const,
};

/** D13/AC-2/AC-2a — the Target step renders one option per registered
 *  target; nothing about an unregistered target ever reaches the DOM. */
export function useCiTargets() {
  return useQuery({
    queryKey: ciKeys.targets(),
    queryFn: () => api.get<CiTargetOption[]>("/ci/targets"),
    staleTime: Infinity,
  });
}

/** AC-3/AC-4c/AC-64 — regenerated on every input change, zero LLM call.
 *  Modeled as a query (not a mutation) so changing any Configure-step input
 *  naturally refetches via the query key, matching D4's "Configure
 *  regenerates the preview" requirement without a manual trigger. Returns
 *  the `CiPreview` envelope (files + secret states + warnings) so the
 *  Configure step reads secret state off THIS response instead of a second
 *  round-trip. */
export function useCiPreview(
  agentId: string | null | undefined,
  input: CiExportInputBody,
  enabled: boolean
) {
  return useQuery({
    queryKey: ciKeys.preview(agentId, input),
    queryFn: () => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
    enabled: enabled && !!agentId,
  });
}

/** AC-36 — the agent editor's CI tab list. */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ciKeys.installations(agentId),
    queryFn: () => api.get<CiInstallationListItem[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** AC-64 — per-secret name + configured state; never a value. */
export function useCiSecretStatus(agentId: string | null | undefined, repo: string) {
  return useQuery({
    queryKey: ciKeys.secrets(agentId, repo),
    queryFn: () => api.get<CiSecretStatus[]>(`/agents/${agentId}/ci/secrets?repo=${encodeURIComponent(repo)}`),
    enabled: !!agentId && repo.trim().length > 0,
    retry: false,
  });
}

/** AC-5…AC-10a/AC-59 — the Install step's "Open a pull request" / "files"
 *  action. Uses `api.postWithStatus` (not `api.post`) because AC-7's
 *  first-install-vs-republish distinction is carried ONLY by the HTTP status
 *  — 201 on a genuine first install, 200 when an existing installation was
 *  reused and republished — with an otherwise identical `CiExport` body
 *  (finding 5, matching `useCreateEvalCaseFromFinding`'s established
 *  201-vs-200 pattern in this same file's sibling module). */
export function useExportCi(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) =>
      api.postWithStatus<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ciKeys.installations(agentId) });
    },
  });
}

/** AC-10 — the Install step's "Download archive" peer option; always
 *  available, never gated on write access. Returns the raw zip `Blob`. */
export async function exportCiArchive(
  agentId: string,
  input: CiExportInputBody
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/export-ci/archive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Could not generate the archive (${res.status})`);
  return res.blob();
}

/** AC-37 — regenerate + republish an existing installation from the agent's
 *  current config. */
export function useRepublishCi(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (installationId: string) =>
      api.post<CiExport>(`/ci/installations/${installationId}/republish`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ciKeys.installations(agentId) });
    },
  });
}

/** AC-26…AC-28 — the CI Runs page's own list read (stored rows only).
 *  Returns the `CiRunsPage` envelope (runs + the agent/repo filter
 *  vocabularies computed from this SAME read) so the view never derives
 *  those option lists from the — possibly filtered — row set it renders. */
export function useCiRuns(filters: CiRunFiltersInput) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ciKeys.runs(filters),
    queryFn: () => apiFetch<CiRunsPage>(`/ci/runs${qs ? `?${qs}` : ""}`),
    // AC-29 — react-query's own `refetchIntervalInBackground: false` default
    // suspends this while the page/tab is hidden; no manual listener needed.
    refetchInterval: 30_000,
  });
}

/** AC-29's manual control — `force: true` bypasses the server's 30s
 *  per-installation debounce. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => api.post<CiRefreshResult>("/ci/refresh", { force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
    },
  });
}
