import type { ReviewRecord, FindingRecord } from "@devdigest/shared";

/**
 * Every finding across all review runs, same order as `runs` (newest-run-first).
 * Shared by the page (findings count for the header) and FindingsTab (lethal
 * trifecta banner) so the flatMap logic isn't duplicated between the two.
 */
export function allFindings(runs: ReviewRecord[]): FindingRecord[] {
  return runs.flatMap((r) => r.findings);
}
