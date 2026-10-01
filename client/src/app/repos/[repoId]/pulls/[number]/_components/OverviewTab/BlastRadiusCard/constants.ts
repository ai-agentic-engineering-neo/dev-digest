import type { BlastDegradedReason } from "@devdigest/shared";

/** Wire enum (snake_case) -> camelCase i18n key under `blast.degraded.reason.*`. */
export const DEGRADED_REASON_KEY: Record<BlastDegradedReason, string> = {
  flag_off: "flagOff",
  index_failed: "indexFailed",
  index_partial: "indexPartial",
  repo_too_large: "repoTooLarge",
  no_data: "noData",
};
