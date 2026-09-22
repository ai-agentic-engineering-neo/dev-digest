import type { Severity } from "@devdigest/shared";

/** Every level must appear here: the Record makes a missing one a type error,
 *  so a level added to the contract cannot be silently missing from the UI. */
const ALL: Record<Severity, true> = {
  CRITICAL: true,
  WARNING: true,
  SUGGESTION: true,
};

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Severity levels in display order. */
export const SEVERITIES = (Object.keys(ALL) as Severity[]).sort(
  (a, b) => (SEVERITY_ORDER[a] ?? 9) - (SEVERITY_ORDER[b] ?? 9),
);
