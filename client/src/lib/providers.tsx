/* providers.tsx — client provider stack: React Query + Theme + active Repo. */
"use client";

import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { ThemeProvider } from "./theme";
import { RepoProvider } from "./repo-context";
import { ToastProvider, notify } from "./toast";
import { createErrorPolicy } from "./error-policy";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => {
    const policy = createErrorPolicy(notify.error);
    const queryCache = new QueryCache({
      onError: (err, query) => policy.onQueryError(err, query),
      onSuccess: (_data, query) => policy.onQuerySuccess(query),
    });
    queryCache.subscribe((event) => {
      if (event.type === "removed") policy.onQueryRemoved(event.query);
    });
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          staleTime: 30_000,
          refetchOnWindowFocus: false,
        },
      },
      // Global error surfacing — which errors toast is decided in error-policy.ts.
      queryCache,
      mutationCache: new MutationCache({
        onError: (err, _vars, _ctx, mutation) => policy.onMutationError(err, mutation),
      }),
    });
  });
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <RepoProvider>{children}</RepoProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
