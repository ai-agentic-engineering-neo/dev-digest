import type { FindingActionKind, Severity } from "@devdigest/shared";

/* Type-only import on purpose: Next's webpack can't resolve the `.js` specifiers
   inside src/vendor/shared, so client code must not import runtime values from it.
   Record<Severity, …> makes tsc fail if the contract gains or drops a level. */
const LEVELS: Record<Severity, true> = { CRITICAL: true, WARNING: true, SUGGESTION: true };

/** Contract severity levels, in chip order. Not SEV/SEVERITY_ORDER keys: those include INFO. */
export const SEVERITY_LEVELS = Object.keys(LEVELS) as Severity[];

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
