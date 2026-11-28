/* error-policy.ts — the one place that decides which React Query errors become
   a toast. Wired into the QueryCache / MutationCache in providers.tsx.
   - Mutations (user actions) toast, unless the mutation renders its own error
     inline and says so with `meta: { errorUi: "inline" }`.
   - Queries toast only on network / 5xx (an expected 4xx such as a 404 stays
     silent for the inline empty state), and only once per failure streak: a
     polling query that keeps failing does not repeat the toast on every poll.
     The streak ends when the query succeeds or is removed from the cache. */
import type { Mutation, Query } from "@tanstack/react-query";
import { ApiError } from "./api";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** "inline": the caller shows this mutation's error itself — no toast. */
      errorUi?: "inline";
    };
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

function isSystemError(err: unknown): boolean {
  const status = err instanceof ApiError ? err.status : 500;
  return status === 0 || status >= 500;
}

type MutationLike = Pick<Mutation, "meta">;
type QueryLike = Pick<Query, "queryHash">;

/** Cache callbacks that send errors to `toast` under the policy above. */
export function createErrorPolicy(toast: (message: string) => void) {
  // Hashes of the queries whose system error has already toasted in the
  // current failure streak.
  const failing = new Set<string>();
  return {
    onQueryError(err: unknown, query: QueryLike) {
      if (!isSystemError(err) || failing.has(query.queryHash)) return;
      failing.add(query.queryHash);
      toast(errorMessage(err));
    },
    onQuerySuccess(query: QueryLike) {
      failing.delete(query.queryHash);
    },
    /** A removed query starts afresh: re-mounted and failing again, it toasts again. */
    onQueryRemoved(query: QueryLike) {
      failing.delete(query.queryHash);
    },
    onMutationError(err: unknown, mutation: MutationLike) {
      if (mutation.meta?.errorUi === "inline") return;
      toast(errorMessage(err));
    },
  };
}
