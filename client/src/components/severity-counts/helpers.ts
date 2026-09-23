import type { FindingRecord, Severity } from "@devdigest/shared";

/** Per-severity finding counts — same shape as `PrMeta.findings_by_severity`. */
export type SeverityCountsMap = Record<Severity, number>;

/** The contract's levels, most severe first (the UI kit's extra INFO never occurs). */
export const SEVERITY_LEVELS: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Count findings per severity; dismissed and accepted ones count too. */
export function countBySeverity(findings: Pick<FindingRecord, "severity">[]): SeverityCountsMap {
  const counts: SeverityCountsMap = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

export function totalOf(counts: SeverityCountsMap): number {
  return SEVERITY_LEVELS.reduce((sum, sev) => sum + counts[sev], 0);
}

/** Most severe first; findings of one severity keep their original order. */
export function sortBySeverity<T extends Pick<FindingRecord, "severity">>(findings: T[]): T[] {
  const rank = (f: T) => {
    const i = SEVERITY_LEVELS.indexOf(f.severity);
    return i === -1 ? SEVERITY_LEVELS.length : i;
  };
  return [...findings].sort((a, b) => rank(a) - rank(b));
}

/** "11" for a single line, "61-74" for a range. */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** Rationale is markdown; the popover shows a two-line plain-text preview. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
