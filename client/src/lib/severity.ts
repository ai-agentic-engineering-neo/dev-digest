/** Sort weight per severity (lower = shown first). Keys are also the set of
   values a `?severity=` URL param may take. */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};
