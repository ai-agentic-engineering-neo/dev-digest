import type { FindingActionKind } from "@devdigest/shared";

export { SEVERITY_ORDER, FILTERABLE_SEVERITIES } from "@/lib/findings";

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
