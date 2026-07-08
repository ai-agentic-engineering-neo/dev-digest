/* hooks/ci.ts — React Query hooks for the Export-to-CI wizard (T9) + CI Tab.
   Not yet wired into the `lib/hooks` barrel (index.ts) — that edit belongs to
   whichever task mounts CiTab (T10), per the owned-paths split for this batch. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExportInputBody, CiExport, CiInstallation } from "@devdigest/shared";

/** POST /agents/:id/export-ci — generates the CI bundle and, for `action: "open_pr"`,
 *  opens the PR. `action: "files"` returns the files without any GitHub side-effect
 *  (used for the wizard's Preview step and the zip degraded path). */
export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: (data) => {
      // Only a persisted installation (open_pr path) should invalidate the
      // CI Tab / CI Runs installation list — a files-only preview call also
      // returns an `installation` shape but must not appear to have "installed".
      if (data.pr_url) {
        qc.invalidateQueries({ queryKey: ["ci-installations", agentId] });
      }
    },
  });
}

/** GET /agents/:id/ci-installations — installations for the CI Tab (T10). */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}
