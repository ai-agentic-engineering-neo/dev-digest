/* query-client.ts — the app's QueryClient factory (used by <Providers>, and by
   tests that need the real global error-toast behaviour). */
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { notify } from "./toast";
import { ApiError } from "./api";
import { errorMessage, hasOwnErrorToast } from "./error-message";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
    // Global error surfacing (errors anywhere → toast). Mutations always
    // toast (they are user actions). Queries only toast on network/5xx —
    // expected 4xx like a 404 "no tour yet" stay silent for inline empty states.
    queryCache: new QueryCache({
      onError: (err) => {
        const status = err instanceof ApiError ? err.status : 500;
        if (status === 0 || status >= 500) notify.error(errorMessage(err));
      },
    }),
    mutationCache: new MutationCache({
      // Skip mutations whose callers show their own contextual error (meta: OWN_ERROR_TOAST).
      onError: (err, _vars, _ctx, mutation) => {
        if (!hasOwnErrorToast(mutation.meta)) notify.error(errorMessage(err));
      },
    }),
  });
}
