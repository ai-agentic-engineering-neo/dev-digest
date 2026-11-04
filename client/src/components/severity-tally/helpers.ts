import type { Severity } from "@devdigest/shared";

/** Contract order (`Severity` enum) — most severe first. */
export const SEVERITY_LEVELS: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export type SeverityCounts = Partial<Record<Severity, number>>;

/** Levels that actually have findings, in contract order — zero levels are omitted. */
export function nonZeroLevels(counts: SeverityCounts): Severity[] {
  return SEVERITY_LEVELS.filter((sev) => (counts[sev] ?? 0) > 0);
}

/** Tally a list of findings by severity (unknown severities are ignored). */
export function countSeverities(findings: readonly { severity: string }[]): Record<Severity, number> {
  const c: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in c) c[f.severity as Severity] += 1;
  }
  return c;
}
