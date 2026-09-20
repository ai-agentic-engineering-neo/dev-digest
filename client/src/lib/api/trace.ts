/* api/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (api/reviews.ts) — the drawer combines both. */

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { RunTrace } from "@devdigest/shared";

export const traceKeys = {
  detail: (runId: string | null | undefined) => ["run-trace", runId] as const,
};

export function useRunTrace(runId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: traceKeys.detail(runId),
    queryFn: () => api.get(`/runs/${runId}/trace`, RunTrace),
    enabled: !!runId && enabled,
    retry: false,
  });
}
