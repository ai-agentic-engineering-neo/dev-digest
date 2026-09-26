/**
 * Severity ranking + "is this finding still active" helpers shared by the
 * Smart Order feature (group chips, file dots, line stripes/labels). Pure —
 * no React, no fetching.
 */
import type { FindingRecord, Severity } from "@devdigest/shared";

/** Lower rank = higher priority. Exhaustive over `Severity` — a new value
    added to the contract fails to compile here until it is placed. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** A finding counts toward dots/chips/auto-expand only while not dismissed.
    Accepted findings are still active (accept confirms a true positive). */
export function isActiveFinding(f: Pick<FindingRecord, "dismissed_at">): boolean {
  return f.dismissed_at === null;
}

/** Highest severity among the ACTIVE findings in the list, or `null` if none
    are active (including an empty list). */
export function highestSeverity(
  fs: Pick<FindingRecord, "severity" | "dismissed_at">[],
): Severity | null {
  let best: Severity | null = null;
  for (const f of fs) {
    if (!isActiveFinding(f)) continue;
    if (best === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[best]) {
      best = f.severity;
    }
  }
  return best;
}
