import type { FindingRecord, Severity, Verdict } from "@devdigest/shared";

/** Active = not dismissed. Accepted findings still count — there is no
 *  separate "accepted" bucket. */
export function activeFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.dismissed_at == null);
}

/** Plain group-by on already-loaded findings — no fetch, no LLM call. */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    const sev = f.severity as Severity;
    if (sev in counts) counts[sev] += 1;
  }
  return counts;
}

/** The verdict a run's findings actually support — derived, never the model's
 *  self-reported `review.verdict`. The model writes its verdict before
 *  citation-grounding drops unanchored findings, so it can say
 *  "request_changes" over a run whose findings were all dropped (0 findings,
 *  score 100). Same rule as the Timeline outcome: an active CRITICAL →
 *  request_changes, any other active finding → comment, none → approve. */
export function effectiveVerdict(findings: FindingRecord[]): Verdict {
  const active = activeFindings(findings);
  if (active.some((f) => f.severity === "CRITICAL")) return "request_changes";
  return active.length > 0 ? "comment" : "approve";
}
