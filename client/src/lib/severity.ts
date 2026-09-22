import { Severity } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Severity levels in display order. Derived from the contract so a level
 *  cannot exist in the data and be silently missing from the UI. */
export const SEVERITIES = [...Severity.options].sort(
  (a, b) => (SEVERITY_ORDER[a] ?? 9) - (SEVERITY_ORDER[b] ?? 9),
);
