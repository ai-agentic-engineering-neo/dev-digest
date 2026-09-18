import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestFindingsPerAgent } from "./helpers";

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-08-01T10:00:00Z",
    findings: [],
    ...over,
  };
}

describe("latestFindingsPerAgent", () => {
  it("keeps only each agent's newest review and sorts findings by severity", () => {
    const reviews: ReviewRecord[] = [
      review({
        id: "old-a1",
        agent_id: "a1",
        created_at: "2026-08-01T09:00:00Z",
        findings: [finding({ id: "stale", severity: "CRITICAL" })],
      }),
      review({
        id: "new-a1",
        agent_id: "a1",
        created_at: "2026-08-01T10:00:00Z",
        findings: [finding({ id: "w1", severity: "WARNING" })],
      }),
      review({
        id: "new-a2",
        agent_id: "a2",
        created_at: "2026-08-01T09:30:00Z",
        findings: [
          finding({ id: "s1", severity: "SUGGESTION" }),
          finding({ id: "c1", severity: "CRITICAL" }),
        ],
      }),
    ];
    const out = latestFindingsPerAgent(reviews);
    expect(out.map((f) => f.id)).toEqual(["c1", "w1", "s1"]);
  });

  it("ignores summary-kind reviews", () => {
    const reviews: ReviewRecord[] = [
      review({
        id: "sum",
        kind: "summary",
        created_at: "2026-08-01T11:00:00Z",
        findings: [finding({ id: "x" })],
      }),
      review({ id: "rev", created_at: "2026-08-01T10:00:00Z", findings: [finding({ id: "y" })] }),
    ];
    expect(latestFindingsPerAgent(reviews).map((f) => f.id)).toEqual(["y"]);
  });

  it("returns empty for no reviews", () => {
    expect(latestFindingsPerAgent([])).toEqual([]);
  });
});
