import type { Severity } from "@devdigest/shared";

/** Severity keys in display order (most → least severe). */
export const SEVERITY_KEYS = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/** Per-severity tallies — every key initialized, so lookups never miss. */
export type SeverityCounts = Record<Severity, number>;

/**
 * Group items by their `severity` field — a plain client-side COUNT over
 * whatever the caller already has (no extra fetches, no derived scores).
 * Unknown severity values are ignored rather than dropped loudly.
 */
export function countBySeverity(items: readonly { severity: string }[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const item of items) {
    if ((SEVERITY_KEYS as readonly string[]).includes(item.severity)) {
      counts[item.severity as Severity] += 1;
    }
  }
  return counts;
}
