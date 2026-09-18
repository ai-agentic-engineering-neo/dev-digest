/**
 * latestFindingsPerAgent mirrors the rule the API uses to build a row's
 * `findings_counts`: each AGENT's latest review, dismissed excluded. If the two
 * ever diverge the hover preview would contradict the chips above it.
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestFindingsPerAgent } from "./helpers";

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
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
    review_id: "rv",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv",
    pr_id: "pr1",
    agent_id: "agent-a",
    run_id: "run1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: null,
    summary: null,
    score: 60,
    model: "m",
    grounding: null,
    created_at: "2026-09-17T10:00:00Z",
    findings: [],
    ...over,
  };
}

describe("latestFindingsPerAgent", () => {
  it("keeps only each agent's newest review", () => {
    const out = latestFindingsPerAgent([
      review({ id: "old", agent_id: "a", created_at: "2026-09-16T10:00:00Z", findings: [finding({ id: "stale" })] }),
      review({ id: "new", agent_id: "a", created_at: "2026-09-17T10:00:00Z", findings: [finding({ id: "fresh" })] }),
    ]);
    expect(out.map((f) => f.id)).toEqual(["fresh"]);
  });

  it("unions across agents, newest review of each", () => {
    const out = latestFindingsPerAgent([
      review({ id: "a1", agent_id: "a", findings: [finding({ id: "fa", severity: "WARNING" })] }),
      review({ id: "b1", agent_id: "b", findings: [finding({ id: "fb", severity: "CRITICAL" })] }),
    ]);
    expect(out.map((f) => f.id)).toEqual(["fb", "fa"]); // sorted by severity
  });

  it("drops dismissed findings", () => {
    const out = latestFindingsPerAgent([
      review({
        findings: [finding({ id: "keep" }), finding({ id: "gone", dismissed_at: "2026-09-17T11:00:00Z" })],
      }),
    ]);
    expect(out.map((f) => f.id)).toEqual(["keep"]);
  });

  it("ignores summary rows — only kind 'review' carries findings", () => {
    const out = latestFindingsPerAgent([review({ kind: "summary", findings: [finding({ id: "x" })] })]);
    expect(out).toEqual([]);
  });

  it("treats reviews with no agent as one bucket", () => {
    const out = latestFindingsPerAgent([
      review({ id: "n1", agent_id: null, created_at: "2026-09-17T12:00:00Z", findings: [finding({ id: "new" })] }),
      review({ id: "n2", agent_id: null, created_at: "2026-09-16T12:00:00Z", findings: [finding({ id: "old" })] }),
    ]);
    expect(out.map((f) => f.id)).toEqual(["new"]);
  });
});
