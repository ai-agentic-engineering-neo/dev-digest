import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestFindingsPerAgent, totalFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"]): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title: `${severity} ${id}`,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
  };
}

function review(o: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: "pr-1",
    agent_id: "security",
    run_id: null,
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 50,
    model: "m",
    created_at: "2026-01-01T12:00:00.000Z",
    findings: [],
    ...o,
  };
}

describe("latestFindingsPerAgent", () => {
  it("lists each agent's latest review, most severe first, and names the agent", () => {
    const shown = latestFindingsPerAgent([
      // Deliberately not newest-first: the helper orders by created_at itself.
      review({
        id: "perf",
        agent_id: "performance",
        agent_name: "Performance Reviewer",
        created_at: "2026-01-01T11:00:00.000Z",
        findings: [finding("p1", "SUGGESTION"), finding("p2", "WARNING")],
      }),
      review({ id: "sec-new", findings: [finding("s1", "CRITICAL")] }),
    ]);
    expect(shown.map((x) => [x.finding.id, x.agentName])).toEqual([
      ["s1", "Security Reviewer"],
      ["p2", "Performance Reviewer"],
      ["p1", "Performance Reviewer"],
    ]);
  });

  it("drops an agent's superseded review and every summary review", () => {
    const shown = latestFindingsPerAgent([
      review({ id: "sec-new", findings: [finding("new", "WARNING")] }),
      review({
        id: "sec-old",
        created_at: "2026-01-01T10:00:00.000Z",
        findings: [finding("old1", "CRITICAL"), finding("old2", "CRITICAL")],
      }),
      review({
        id: "summary",
        kind: "summary",
        agent_id: "summarizer",
        created_at: "2026-01-01T13:00:00.000Z",
        findings: [finding("sum", "CRITICAL")],
      }),
    ]);
    expect(shown.map((x) => x.finding.id)).toEqual(["new"]);
  });
});

describe("totalFindings", () => {
  it("adds the three levels and treats a missing value as none", () => {
    expect(totalFindings({ CRITICAL: 1, WARNING: 2, SUGGESTION: 2 })).toBe(5);
    expect(totalFindings(null)).toBe(0);
    expect(totalFindings(undefined)).toBe(0);
  });
});
