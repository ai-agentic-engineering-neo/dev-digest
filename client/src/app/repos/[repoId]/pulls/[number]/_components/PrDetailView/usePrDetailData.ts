/* Orchestration for the PR detail screen: resolve the route's PR number to
   its row id, load the PR + its reviews and runs, and expose the run
   mutations / cache refreshes the tabs need. No JSX, no raw query keys. */
"use client";

import { usePullDetail, usePulls } from "@/lib/hooks/pulls";
import {
  useCancelRun,
  useDeleteRun,
  useInvalidatePrRuns,
  usePrActiveRuns,
  usePrReviews,
  usePrRuns,
} from "@/lib/hooks/reviews";
import { collectFindings, resolvePrId, selectLethalTrifecta } from "./helpers";

export function usePrDetailData(repoId: string, number: string) {
  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = resolvePrId(pulls, number);
  const detail = usePullDetail(prId);
  const { data: reviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const invalidateRuns = useInvalidatePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const cancel = useCancelRun();

  const runs = reviews ?? [];
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const findings = collectFindings(runs);

  return {
    prId,
    pr: detail.data,
    isLoading: pullsLoading || (prId != null && detail.isLoading),
    isError: detail.isError,
    error: detail.error,
    refetch: detail.refetch,
    runs,
    prRuns,
    liveRunIds,
    reviewRunning: liveRunIds.length > 0,
    findingsCount: findings.length,
    lethalTrifecta: selectLethalTrifecta(findings),
    cancel,
    deleteRun: (runId: string) => deleteRun.mutate(runId),
    /** New runs were started — pick them up as "active". */
    onRunsStarted: () => invalidateRuns(),
    /** A run settled (done OR failed) — refresh active runs, run history and reviews. */
    onRunSettled: () => invalidateRuns({ history: true }),
  };
}
