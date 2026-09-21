import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER, SEVERITIES } from "./constants";

export function countsBySeverity(findings: FindingRecord[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) if (f.severity in out) out[f.severity]! += 1;
  return out;
}

export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severities: ReadonlySet<string> = new Set(),
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severities.size > 0) shown = shown.filter((f) => severities.has(f.severity));
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
