import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";

export function finding(
  id: string,
  severity: Severity,
  opts: Partial<FindingRecord> = {},
): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title: `${severity} ${id}`,
    file: `src/${id}.ts`,
    start_line: 10,
    end_line: 10,
    rationale: `Rationale for ${id}.`,
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
    ...opts,
  };
}

export function review(id: string, agentId: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr-1",
    agent_id: agentId,
    run_id: null,
    agent_name: agentId,
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 0,
    model: null,
    created_at: new Date().toISOString(),
    findings,
  };
}

/** Two current reviews (sec, perf) + one superseded sec review. */
export const REVIEWS: ReviewRecord[] = [
  review("r-perf", "perf", [finding("s1", "SUGGESTION", { confidence: 0.7 })]),
  review("r-sec", "sec", [
    finding("w1", "WARNING"),
    finding("c-low", "CRITICAL", { confidence: 0.6 }),
    finding("c-high", "CRITICAL", { confidence: 0.98 }),
    finding("c-dismissed", "CRITICAL", { dismissed_at: "2026-11-22T00:00:00Z" }),
  ]),
  review("r-sec-old", "sec", [finding("old", "CRITICAL")]),
];
export const LATEST_IDS = ["r-sec", "r-perf"];
