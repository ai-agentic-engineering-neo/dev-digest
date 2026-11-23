import type { FindingActionKind, Severity } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};

/** Every contract severity, in display order. Typed as Record<Severity, …> so
 *  tsc fails if the Zod contract gains or loses a level. Kept type-only:
 *  a runtime import from @devdigest/shared breaks the Next build (its barrel
 *  re-exports with .js extensions). */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
export const SEVERITY_LEVELS = (Object.keys(SEVERITY_RANK) as Severity[]).sort(
  (a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b],
);
