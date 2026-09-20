/** Sort weight per severity (lower = shown first). Shared across the PR
 *  detail route (FindingsPanel) and cross-route components (FindingsSeverityIcons). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};
