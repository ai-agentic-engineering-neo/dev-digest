import type { FindingRecord, Severity } from "@devdigest/shared";

/**
 * The contract's severity levels, in display order. Kept here (not read from the
 * `Severity` Zod enum at runtime) because the client imports `@devdigest/shared`
 * for types only: a runtime import makes Next's webpack resolve the barrel's
 * `./contracts/*.js` specifiers, which fails (vitest and tsc don't catch it).
 */
export const SEVERITY_LEVELS = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies readonly Severity[];

// Typecheck fails here if the contract gains a level missing from SEVERITY_LEVELS.
type AssertNever<T extends never> = T;
export type AllSeverityLevelsCovered = AssertNever<
  Exclude<Severity, (typeof SEVERITY_LEVELS)[number]>
>;

/**
 * Count findings per severity level. Every contract level is present (0 when
 * there are none); values outside the contract are ignored.
 */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_LEVELS.map((sev) => [sev, 0])) as Record<
    Severity,
    number
  >;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/** A copy of `findings`, most severe first (stable within a level). */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  const rank = (f: FindingRecord) => {
    const i = (SEVERITY_LEVELS as readonly string[]).indexOf(f.severity);
    return i === -1 ? SEVERITY_LEVELS.length : i;
  };
  return [...findings].sort((a, b) => rank(a) - rank(b));
}
