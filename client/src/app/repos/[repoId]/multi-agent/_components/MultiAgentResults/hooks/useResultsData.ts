"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrRuns, usePrReviews, useRunEvents } from "@/lib/hooks/reviews";
import { buildColumns } from "../../../helpers";
import type { AgentColumnView, SelectedAgent, StartStates } from "../../../types";

export function useResultsData(
  prId: string,
  agents: readonly SelectedAgent[],
  startStates: StartStates,
): {
  columns: AgentColumnView[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  hasAnyRun: boolean;
} {
  const qc = useQueryClient();
  const runs = usePrRuns(prId);
  const reviews = usePrReviews(prId);

  const columns = buildColumns(agents, runs.data ?? [], reviews.data ?? [], startStates);

  const runningIds = columns.flatMap((c) => (c.state.kind === "running" ? [c.state.run.run_id] : []));
  const { running } = useRunEvents(runningIds);

  // SSE settled (true -> false): refresh the caches the columns derive from.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
    }
  }, [running, qc, prId]);

  const hasAnyRun = columns.some((c) => c.state.kind !== "starting") || Object.keys(startStates).length > 0;

  // A failed fetch must not read as "no run yet": surface it so the page can show an error + retry.
  const refetch = () => {
    void runs.refetch();
    void reviews.refetch();
  };

  return {
    columns,
    isLoading: runs.isLoading || reviews.isLoading,
    isError: runs.isError || reviews.isError,
    refetch,
    hasAnyRun,
  };
}
