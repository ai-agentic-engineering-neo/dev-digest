import type { SeverityCounts } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_SORT_WEIGHT: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Display order of the severity count badges, worst first. */
export const SEVERITY_DISPLAY_ORDER = [
  "CRITICAL",
  "WARNING",
  "SUGGESTION",
] as const satisfies readonly (keyof SeverityCounts)[];

/** Rationale is clamped to this many lines in the popover. */
export const RATIONALE_CLAMP_LINES = 3;
