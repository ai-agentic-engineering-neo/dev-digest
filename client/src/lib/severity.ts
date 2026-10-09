/** Shared severity display order — used by the PR list badges and the
    findings panel's chips, so both read in the same sequence. */

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/**
 * A `{ CRITICAL: 2, SUGGESTION: 1 }` counts record → entries in display order.
 * Zero counts are dropped: an empty badge is noise in a dense row, and on the
 * findings panel a zero chip would filter to an empty list.
 */
export function orderedSeverityCounts(
  counts: Record<string, number> | null | undefined,
): { severity: string; count: number }[] {
  if (!counts) return [];
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}
