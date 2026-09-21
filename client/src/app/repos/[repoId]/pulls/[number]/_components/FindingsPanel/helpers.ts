import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Counts per severity, in display order. Feed this the ALREADY-visible list
 * (post hide-low-confidence) so the chip numbers always match the cards
 * rendered beneath them. Severities with no findings are left out — a zero
 * chip would filter to an empty list.
 */
export function countBySeverity(shown: FindingRecord[]): { severity: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of shown) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  return [...counts.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

/** Keep only one severity; `null` means no severity filter is active. */
export function bySeverity(shown: FindingRecord[], severity: string | null): FindingRecord[] {
  return severity == null ? shown : shown.filter((f) => f.severity === severity);
}
