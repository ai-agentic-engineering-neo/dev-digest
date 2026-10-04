import type { BlastDegradedReason } from "@devdigest/shared";

/** Symbol cards shown before the "show more" button. */
export const MAX_VISIBLE_SYMBOLS = 12;

/** Endpoint chips shown in the "other endpoints" group before it is expanded. */
export const MAX_OTHER_ENDPOINTS = 6;

/** Icon (a key of `Icon` from @devdigest/ui) for each summary stat. */
export const STAT_ICON = {
  symbols: "Code",
  callers: "CornerDownRight",
  endpoints: "Globe",
  crons: "Clock",
} as const;

/** Wire enum (snake_case) -> camelCase i18n key under `blast.degraded.reason.*`. */
export const DEGRADED_REASON_KEY: Record<BlastDegradedReason, string> = {
  flag_off: "flagOff",
  index_failed: "indexFailed",
  index_partial: "indexPartial",
  repo_too_large: "repoTooLarge",
  no_data: "noData",
};
