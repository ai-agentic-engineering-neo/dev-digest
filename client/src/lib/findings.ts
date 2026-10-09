/**
 * Client-side severity counting for already-loaded findings — a pure
 * groupBy/count, never a fresh network or LLM call (the counts must stay in
 * sync with whatever findings are already in memory, e.g. expanding a Review
 * run card or hovering the PR-list FINDINGS popover).
 *
 * Uppercase-keyed to match `Finding.severity` and `SEV` (tokens.ts) directly,
 * so callers can feed a count straight into `SeverityBadge` without
 * remapping. This is the client-local analog of the server's
 * `rollupSeverities` (server/src/modules/pulls/status.ts), kept separate
 * because it lives in a different layer/casing, not a duplicate to dedupe.
 */
import type { Severity } from "@devdigest/shared";

export type SeverityCounts = Record<Severity, number>;

const EMPTY: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };

export function countBySeverity(findings: { severity: string }[]): SeverityCounts {
  const counts: SeverityCounts = { ...EMPTY };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as Severity] += 1;
  }
  return counts;
}

/** Severities with at least one finding, in CRITICAL → WARNING → SUGGESTION order. */
export function presentSeverities(counts: SeverityCounts): Severity[] {
  return (["CRITICAL", "WARNING", "SUGGESTION"] as const).filter((sev) => counts[sev] > 0);
}
