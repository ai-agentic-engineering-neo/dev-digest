/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { RunTrace } from "@devdigest/shared";

/** Query-options factories for the trace domain: the single source of each
    query key + fetcher. Per-screen knobs (enabled, retry, polling) stay in the hooks. */
export const traceQueries = {
  run: (runId: string | null | undefined) =>
    queryOptions({
      queryKey: ["run-trace", runId] as const,
      queryFn: () => api.get<RunTrace>(`/runs/${runId}/trace`),
    }),
};

export function useRunTrace(runId: string | null | undefined, enabled = true) {
  return useQuery({
    ...traceQueries.run(runId),
    enabled: !!runId && enabled,
    retry: false,
  });
}
