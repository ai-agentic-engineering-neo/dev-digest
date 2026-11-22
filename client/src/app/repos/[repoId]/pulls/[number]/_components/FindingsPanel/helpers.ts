import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_LEVELS, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings. Shared by the counters and the list
   so the numbers always equal the cards. */
export function applyConfidence(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** Count findings per contract severity level (all 3 keys, zeros included). */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_LEVELS.map((l) => [l, 0])) as Record<Severity, number>;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/** Levels to render as counters: non-zero ones, plus the active one even at 0
   (so the filter can still be removed). Fixed order CRITICAL → SUGGESTION. */
export function visibleLevels(counts: Record<Severity, number>, active: Severity | null): Severity[] {
  return SEVERITY_LEVELS.filter((l) => counts[l] > 0 || l === active);
}

/** Confidence filter → optional severity filter → sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = applyConfidence(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
