import type { SeverityCounts } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). Mirrors
 *  FindingsPanel/constants.ts's SEVERITY_ORDER for the read-only preview list. */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** Severities in display order, paired with their count-object key. */
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export interface FindingPreviewLike {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale: string;
}

/** Format a finding's line range ("11" when single-line, else "11-15"). Same
 *  shape as FindingCard/helpers.ts's lineLabel, duplicated per the repo's
 *  convention of not sharing a format.ts across component trees. */
export function lineLabel(f: Pick<FindingPreviewLike, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function totalCount(counts: SeverityCounts): number {
  return counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
}

export interface FindingsSummaryView {
  counts: SeverityCounts;
  items: FindingPreviewLike[];
}

/** A finding shape with a dismissal marker — what ReviewRecord.findings
 *  (FindingRecord[]) already looks like. */
type DismissableFinding = FindingPreviewLike & { dismissed_at: string | null };

/**
 * Group already-loaded findings by severity, excluding dismissed ones — a
 * plain COUNT/filter, never a new LLM call. Used by the Agent-runs Timeline,
 * which has the full ReviewRecord.findings client-side; the PR list instead
 * reads the server-computed `findings_summary` directly (see
 * server/specs/pr-findings-summary.md).
 */
export function summarizeFindings(findings: DismissableFinding[]): FindingsSummaryView {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  const kept = findings.filter((f) => f.dismissed_at == null);
  for (const f of kept) {
    if (f.severity in counts) counts[f.severity as keyof SeverityCounts] += 1;
  }
  const items = [...kept].sort((a, b) => {
    const bySeverity = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    return bySeverity !== 0 ? bySeverity : b.confidence - a.confidence;
  });
  return { counts, items };
}
