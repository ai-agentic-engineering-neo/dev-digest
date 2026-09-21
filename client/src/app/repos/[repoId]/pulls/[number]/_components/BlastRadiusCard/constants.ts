import type { BlastIndexStatus } from "@/lib/hooks/blast-radius";

/**
 * Non-blocking banner copy per index status — distinct wording per state, shown
 * ABOVE the (still real, just incomplete) results rather than masking them
 * behind a blocking screen. `full`/`failed` render no banner here — `failed`
 * has no separate copy in v1 (specs/07-blast-radius.md only calls out
 * `partial`/`degraded`).
 */
export const STATUS_BANNER: Partial<Record<BlastIndexStatus, string>> = {
  partial:
    "This repo's index is only partially built — some callers or impacted endpoints may be missing.",
  degraded:
    "This repo's index isn't available yet — showing a best-effort, less precise blast radius.",
};
