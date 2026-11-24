/* hooks/parse-run-event.ts — validates one SSE frame from /runs/:id/events
   against the RunEvent contract instead of trusting a cast.
   The schema is imported from the specific contract FILE, not the
   @devdigest/shared barrel: the barrel re-exports with `.js` extensions that
   webpack can't resolve (client/INSIGHTS.md), while contracts/trace.ts only
   imports zod and resolves fine at runtime. */
import { RunEvent as RunEventSchema } from "@/vendor/shared/contracts/trace";
import type { RunEvent } from "@devdigest/shared";

/**
 * Parse an SSE `data` payload into a RunEvent.
 * Returns null (never throws) when the frame should be skipped:
 *  - non-JSON / empty data (keepalive frames, dataless native `error` events) — silently;
 *  - JSON that doesn't match the RunEvent contract — with a dev-only console.warn,
 *    so contract drift is visible without breaking the live log.
 */
export function parseRunEvent(raw: unknown): RunEvent | null {
  if (typeof raw !== "string" || raw === "") return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = RunEventSchema.safeParse(json);
  if (!result.success) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[useRunEvents] skipped an SSE event that does not match RunEvent", {
        issues: result.error.issues,
        data: json,
      });
    }
    return null;
  }
  return result.data;
}
