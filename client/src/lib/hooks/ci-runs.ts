/* hooks/ci-runs.ts — TanStack Query hooks for the global CI Runs page (Track E).
   `useCiRuns` reads the CI Runs list (source='ci' rows, backed by `agent_runs`).
   `useRefreshCiRuns` triggers the server-side pull ingest (POST /ci/refresh).

   Expected server routes (Track B/T6, not yet implemented — this hook is built
   against T1's `CiRun` contract and mocked in tests so this task stays
   independent of the server module):
     GET  /ci/runs    -> CiRun[]
     POST /ci/refresh -> CiRefreshResult

   Degraded-refresh handling (AC-32, client side): when the pull path can't
   reach GitHub (rate limit/outage) it reports `degraded: true` and the server
   guarantees no partial rows were written. On a degraded result we deliberately
   do NOT invalidate the `ci-runs` query — the currently rendered list is left
   untouched so nothing appears to disappear. On a clean refresh we invalidate
   so the list picks up newly ingested runs. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiRun } from "@devdigest/shared";

export const CI_RUNS_QUERY_KEY = ["ci-runs"] as const;

export function useCiRuns() {
  return useQuery({
    queryKey: CI_RUNS_QUERY_KEY,
    queryFn: () => api.get<CiRun[]>("/ci/runs"),
  });
}

/** Response of `POST /ci/refresh` — shape assumed pending T6; adjust here if it differs. */
export interface CiRefreshResult {
  degraded: boolean;
  message?: string | null;
}

export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci/refresh"),
    onSuccess: (result) => {
      // Preserve the existing list when degraded — no refetch, no risk of the
      // UI momentarily showing an empty/partial page while the query re-runs.
      if (!result.degraded) {
        qc.invalidateQueries({ queryKey: CI_RUNS_QUERY_KEY });
      }
    },
  });
}
