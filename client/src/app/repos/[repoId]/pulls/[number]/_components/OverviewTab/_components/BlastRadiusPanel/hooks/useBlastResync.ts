"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { repoIntelStateQuery, useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { RESYNC_POLL_TIMEOUT_MS } from "../constants";

/**
 * Starts a repo-intel resync and invalidates the blast query once the index state advances.
 *
 * The index status enum is terminal-only, so completion = `updatedAt` moves past the baseline.
 * The baseline is read FRESH from the server right before the resync: the cached state is not
 * polled while idle, so if the index advanced since it was fetched, the first poll would look
 * like "finished" before our reindex even ran.
 */
export function useBlastResync(repoId: string, prId: string) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  // `updatedAt` of the index state when the resync started; null = not resyncing.
  const [baseline, setBaseline] = useState<string | null>(null);
  // Reading the fresh baseline (before the resync request is sent).
  const [starting, setStarting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const state = useRepoIntelStatus(repoId, baseline !== null);

  const finished = baseline !== null && state.data != null && state.data.updatedAt !== baseline;
  const canStart = state.data != null && baseline === null && !starting && !resync.isPending;

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

  async function start() {
    if (!canStart) return;
    setTimedOut(false);
    setStarting(true);
    try {
      const fresh = await qc.fetchQuery({ ...repoIntelStateQuery(repoId), staleTime: 0 });
      setBaseline(fresh.updatedAt);
      resync.mutate(undefined, { onError: () => setBaseline(null) });
    } catch {
      // Index state unreadable → don't start; the button becomes available again.
    } finally {
      setStarting(false);
    }
  }

  return { start, canStart, resyncing: starting || baseline !== null || resync.isPending, timedOut };
}
