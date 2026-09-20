/* api/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. */

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "./client";
import { notify } from "../toast";
import {
  ActiveRun,
  PrCommentInput,
  PrReviewComment,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
} from "@devdigest/shared";
import type { FindingActionKind, RunEvent } from "@devdigest/shared";

export const reviewKeys = {
  activeRuns: (prId: string | null | undefined) => ["pr-active-runs", prId] as const,
  runs: (prId: string | null | undefined) => ["pr-runs", prId] as const,
  list: (prId: string | null | undefined) => ["reviews", prId] as const,
  comments: (prId: string | null | undefined) => ["pr-comments", prId] as const,
};

// ---- Active (in-flight) runs — server-side source of truth ----

/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: reviewKeys.activeRuns(prId),
    queryFn: () => api.get(`/pulls/${prId}/runs/active`, ActiveRun.array()),
    enabled: !!prId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),
  });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: reviewKeys.runs(prId),
    queryFn: () => api.get(`/pulls/${prId}/runs`, RunSummary.array()),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

// ---- Persisted reviews + findings for a PR ----
// `enabled` gates the fetch beyond `!!prId` — e.g. the PR-list hover preview
// only wants this to fire on first hover, not for every row on page load.
// The query key stays ["reviews", prId] regardless, so once fetched it's
// cached for any other caller (including the PR detail page).
export function usePrReviews(prId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: reviewKeys.list(prId),
    queryFn: () => api.get(`/pulls/${prId}/reviews`, ReviewRecord.array()),
    enabled: !!prId && enabled,
  });
}

/** Delete one run from the PR's run history (+ its trace). */
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    // Deleting a run also deletes the review it produced (server-side), so drop
    // both the timeline and the Review Runs list from cache.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reviewKeys.runs(prId) });
      qc.invalidateQueries({ queryKey: reviewKeys.list(prId) });
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step). */
export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.list(prId) }),
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: reviewKeys.comments(prId),
    queryFn: () => api.get(`/pulls/${prId}/comments`, PrReviewComment.array()),
    enabled: !!prId,
  });
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PrCommentInput) =>
      api.post(`/pulls/${prId}/comments`, input, PrReviewComment),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.comments(prId) }),
  });
}

// ---- Run a review (all enabled agents or a specific agent) ----
// `RunRequest` (the wire body) never crosses as-is: `prId` addresses the URL,
// not the JSON body — so this stays a local client-argument wrapper, not a
// contract schema (see plan step 3 note on RunReviewInput).
export interface RunReviewInput extends RunRequest {
  prId: string;
}

export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, all }: RunReviewInput) =>
      api.post(
        `/pulls/${prId}/review`,
        {
          ...(agentId ? { agentId } : {}),
          ...(all ? { all } : {}),
        },
        ReviewRunResponse,
      ),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: reviewKeys.list(prId) });
    },
  });
}

// ---- Finding actions (accept/dismiss) ----
export function useFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
      reply,
      prId: _prId,
    }: {
      findingId: string;
      action: FindingActionKind;
      reply?: string;
      prId?: string;
    }) =>
      api.post<{ finding: ReviewRecord["findings"][number]; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onSuccess: (_d, { prId }) => {
      if (prId) qc.invalidateQueries({ queryKey: reviewKeys.list(prId) });
    },
  });
}

/**
 * Subscribe to a run's SSE event stream. Returns the accumulated RunEvents and a
 * `running` flag (true until the stream closes). Live status for the
 * RunReviewDropdown / Live Log. Multiple runIds are subscribed in parallel.
 */
export function useRunEvents(runIds: string[]) {
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [running, setRunning] = React.useState(false);
  const key = runIds.join(",");

  React.useEffect(() => {
    if (runIds.length === 0) return;
    setEvents([]);
    setRunning(true);
    const sources: EventSource[] = [];
    let open = runIds.length;

    for (const runId of runIds) {
      const es = new EventSource(`${API_BASE}/runs/${runId}/events`);
      const onMsg = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as RunEvent;
          setEvents((prev) => [...prev, parsed]);
          // Runtime agent failures arrive as SSE `error` events (not as a
          // mutation/query error), so the global error toast never sees them —
          // surface them here so the user gets a notification without a reload.
          if (parsed.kind === "error" && parsed.msg) notify.error(parsed.msg);
        } catch {
          /* ignore non-JSON keepalive frames (and dataless native error events) */
        }
      };
      // The server tags events with kind as the SSE `event:` name AND emits them
      // as default messages too in some clients — listen broadly.
      es.onmessage = onMsg;
      for (const kind of ["info", "tool", "result", "error"]) {
        es.addEventListener(kind, onMsg as EventListener);
      }
      es.onerror = () => {
        es.close();
        open -= 1;
        if (open <= 0) setRunning(false);
      };
      sources.push(es);
    }

    return () => {
      for (const es of sources) es.close();
      setRunning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { events, running };
}
