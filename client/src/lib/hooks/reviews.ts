/* hooks/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. Every mutation owns the
   invalidation of the PR-scoped queries it changes (prKeys in ./keys). */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { notify } from "../toast";
import { prKeys, RUN_SCOPED_PR_KEYS } from "./keys";
import { EMPTY_RUN_EVENTS, RunEventsStore, mergeRunEvents } from "./run-events-store";
import type {
  ActiveRun,
  FindingActionKind,
  FindingRecord,
  PrCommentInput,
  PrReviewComment,
  ReviewRecord,
  ReviewRunResponse,
  RunEvent,
  RunSummary,
} from "@devdigest/shared";

/** Refetch everything a started / cancelled / finished run changes on one PR. */
function invalidateRunScoped(qc: QueryClient, prId: string | null | undefined) {
  if (!prId) return;
  qc.invalidateQueries({ queryKey: prKeys.activeRuns(prId) });
  qc.invalidateQueries({ queryKey: prKeys.runs(prId) });
  qc.invalidateQueries({ queryKey: prKeys.reviews(prId) });
  // A review may have derived/refreshed the PR's intent (server/specs/05-intent-layer.md).
  qc.invalidateQueries({ queryKey: prKeys.intent(prId) });
}

// ---- Active (in-flight) runs — server-side source of truth ----
/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: prKeys.activeRuns(prId),
    queryFn: () => api.get<ActiveRun[]>(`/pulls/${prId}/runs/active`),
    enabled: !!prId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),
  });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: prKeys.runs(prId),
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

// ---- Persisted reviews + findings for a PR ----
/** `enabled: false` defers the fetch (the PR list loads a PR's findings only on hover). */
export function usePrReviews(prId: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: prKeys.reviews(prId),
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
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
      qc.invalidateQueries({ queryKey: prKeys.runs(prId) });
      qc.invalidateQueries({ queryKey: prKeys.reviews(prId) });
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step).
   The server marks the run cancelled at once, so the PR's active runs, run
   history and reviews are refetched. */
export function useCancelRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
    onSettled: () => invalidateRunScoped(qc, prId),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: prKeys.reviews(prId) }),
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: prKeys.comments(prId),
    queryFn: () => api.get<PrReviewComment[]>(`/pulls/${prId}/comments`),
    enabled: !!prId,
  });
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PrCommentInput) => api.post<PrReviewComment>(`/pulls/${prId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: prKeys.comments(prId) }),
  });
}

// ---- Run a review (all enabled agents or a specific agent) ----
export interface RunReviewInput {
  prId: string;
  agentId?: string;
  all?: boolean;
}

/** Start a review. The new runs show up in the PR's active runs (→ live SSE),
   run history and — for fast runs — reviews, so all three are refetched. */
export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, all }: RunReviewInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, {
        ...(agentId ? { agentId } : {}),
        ...(all ? { all } : {}),
      }),
    onSuccess: (_d, { prId }) => invalidateRunScoped(qc, prId),
  });
}

// ---- Finding actions (accept/dismiss) ----
export interface FindingActionInput {
  findingId: string;
  action: FindingActionKind;
  reply?: string;
}

/** Stamp the acted-on finding in a cached reviews list (optimistic update). */
export function applyFindingAction(
  reviews: ReviewRecord[],
  findingId: string,
  action: FindingActionKind,
  at: string,
): ReviewRecord[] {
  const stamp = (f: FindingRecord): FindingRecord =>
    action === "accept" ? { ...f, accepted_at: at } : action === "dismiss" ? { ...f, dismissed_at: at } : f;
  return reviews.map((r) =>
    r.findings.some((f) => f.id === findingId)
      ? { ...r, findings: r.findings.map((f) => (f.id === findingId ? stamp(f) : f)) }
      : r,
  );
}

/** Accept / dismiss a finding of one PR. The PR's reviews cache is updated
   optimistically (rolled back on error) and always refetched when settled. */
export function useFindingAction(prId: string) {
  const qc = useQueryClient();
  const key = prKeys.reviews(prId);
  return useMutation({
    mutationFn: ({ findingId, action, reply }: FindingActionInput) =>
      api.post<{ finding: FindingRecord; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onMutate: async ({ findingId, action }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ReviewRecord[]>(key);
      if (previous) {
        qc.setQueryData<ReviewRecord[]>(key, applyFindingAction(previous, findingId, action, new Date().toISOString()));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---- Live run events (SSE) ----
/** One run-events store per QueryClient: finished runs refresh that client's
   PR run/review queries, and tests get a fresh store with a fresh client. */
const stores = new WeakMap<QueryClient, RunEventsStore>();

function runEventsStoreFor(qc: QueryClient): RunEventsStore {
  let store = stores.get(qc);
  if (!store) {
    store = new RunEventsStore({
      url: (runId) => `${API_BASE}/runs/${runId}/events`,
      // Runtime agent failures arrive as SSE `error` events (not as a
      // mutation/query error), so the global error toast never sees them.
      onErrorEvent: (msg) => notify.error(msg),
      // The run id does not say which PR it belongs to: refresh the run-scoped
      // queries of every PR (only the mounted ones actually refetch).
      onFinish: () =>
        qc.invalidateQueries({
          queryKey: prKeys.all,
          predicate: (q) => (RUN_SCOPED_PR_KEYS as readonly unknown[]).includes(q.queryKey[2]),
        }),
    });
    stores.set(qc, store);
  }
  return store;
}

const serverSnapshot = () => EMPTY_RUN_EVENTS;

/**
 * Subscribe to the SSE event streams of `runIds`. Returns their events merged
 * in arrival order and `running` (true while any of them is still streaming).
 * Streams are opened/closed per run id, so adding a run keeps the others' logs;
 * when a run finishes, the PR's runs / active runs / reviews are refetched.
 */
export function useRunEvents(runIds: string[]): { events: RunEvent[]; running: boolean } {
  const qc = useQueryClient();
  const store = runEventsStoreFor(qc);
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);

  // A stable identity per distinct id list: callers pass a fresh array per render.
  const key = runIds.join(",");
  const ids = React.useMemo(() => (key ? key.split(",") : []), [key]);

  React.useEffect(() => {
    const releases = ids.map((id) => store.retain(id));
    return () => releases.forEach((release) => release());
  }, [ids, store]);

  return React.useMemo(() => {
    const states = ids.map((id) => snapshot.get(id));
    return {
      events: mergeRunEvents(states),
      // Not yet retained (first render) counts as running, like a fresh stream.
      running: states.some((st) => !st || !st.done),
    };
  }, [ids, snapshot]);
}
