"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { contextDocsKey, useContextDocs } from "@/lib/hooks/project-context";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import type { ContextDocList } from "@/lib/types";

/** Stop polling the doc list this long after a resync started. */
const RESYNC_POLL_TIMEOUT_MS = 60_000;

/** What "the resync changed something" compares: the repo state and the number of docs. */
const signatureOf = (list: ContextDocList | undefined): string | null =>
  list ? `${list.state.status}:${list.docs.length}` : null;

/**
 * Starts a repo resync (fetch + reindex) and polls the doc list every 3 s until its state or doc
 * count differs from the value read FRESH right before the click (a cached list may be stale, so
 * an already-changed value would end polling at once), or until 60 s pass.
 */
export function useContextResync(repoId: string) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  // signature before the resync; null = not resyncing
  const [baseline, setBaseline] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const docs = useContextDocs(repoId, { poll: baseline !== null });

  const current = signatureOf(docs.data);
  const finished = baseline !== null && current !== null && current !== baseline;

  useEffect(() => {
    if (finished) setBaseline(null);
  }, [finished]);

  useEffect(() => {
    if (baseline === null) return;
    const id = setTimeout(() => setBaseline(null), RESYNC_POLL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [baseline]);

  async function start() {
    if (starting || baseline !== null || resync.isPending) return;
    setStarting(true);
    try {
      await qc.refetchQueries({ queryKey: contextDocsKey(repoId), exact: true });
      const fresh = signatureOf(qc.getQueryData<ContextDocList>(contextDocsKey(repoId)));
      setBaseline(fresh ?? "");
      resync.mutate(undefined, { onError: () => setBaseline(null) });
    } finally {
      setStarting(false);
    }
  }

  return { start, busy: starting || baseline !== null || resync.isPending };
}
