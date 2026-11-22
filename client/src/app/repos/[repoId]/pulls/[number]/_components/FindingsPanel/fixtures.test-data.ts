import type { FindingRecord, Severity } from "@devdigest/shared";

export function finding(id: string, severity: Severity, confidence = 0.9, title = `${severity} ${id}`): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title,
    file: `src/${id}.ts`,
    start_line: 10,
    end_line: 12,
    rationale: "Rationale.",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

/** 1 CRITICAL · 2 WARNING (one low-confidence) · 1 SUGGESTION, deliberately unsorted. */
export const MIXED: FindingRecord[] = [
  finding("s1", "SUGGESTION", 0.8, "Suggestion one"),
  finding("w1", "WARNING", 0.9, "Warning high conf"),
  finding("c1", "CRITICAL", 0.95, "Critical one"),
  finding("w2", "WARNING", 0.5, "Warning low conf"),
];
