import type { FindingActionKind } from "@devdigest/shared";

/** Re-exported for existing call sites; moved to lib/severity.ts since it's
 *  now also needed by the cross-route FindingsSeverityIcons component. */
export { SEVERITY_ORDER } from "../../../../../../../lib/severity";

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
