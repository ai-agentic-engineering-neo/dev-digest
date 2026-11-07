"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { RESYNC_POLL_TIMEOUT_MS } from "../constants";

/** Starts a repo-intel resync and invalidates the blast query once the index state advances. */
export function useBlastResync(repoId: string, prId: string) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  // `updatedAt` of the index state when the resync started; null = not resyncing.
  const [baseline, setBaseline] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const state = useRepoIntelStatus(repoId, baseline !== null);

  const finished = baseline !== null && state.data != null && state.data.updatedAt !== baseline;
  const canStart = state.data != null && baseline === null && !resync.isPending;

  useEffect(() => {
    if (!finished) return;
    qc.invalidateQueries({ queryKey: ["blast", prId] });
    setBaseline(null);
  }, [finished, qc, prId]);

  useEffect(() => {
    if (baseline === null) return;
    const id = setTimeout(() => {
      setBaseline(null);
      setTimedOut(true);
    }, RESYNC_POLL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [baseline]);

  function start() {
    if (!state.data) return;
    setTimedOut(false);
    setBaseline(state.data.updatedAt);
    resync.mutate(undefined, { onError: () => setBaseline(null) });
  }

  return { start, canStart, resyncing: baseline !== null || resync.isPending, timedOut };
}
