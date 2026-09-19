import { describe, it, expect } from "vitest";
import type { PrMeta } from "@devdigest/shared";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import { presentFindingsSeverities, latestFindingsPerAgent } from "./helpers";

function pr(findings_counts: PrMeta["findings_counts"]): PrMeta {
  return {
    id: "pr1",
    number: 1,
    title: "t",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "sha",
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: "needs_review",
    findings_counts,
  } as PrMeta;
}

describe("presentFindingsSeverities", () => {
  it("orders CRITICAL → WARNING → SUGGESTION and drops absent severities", () => {
    expect(presentFindingsSeverities(pr({ WARNING: 2, CRITICAL: 1 }))).toEqual([
      ["CRITICAL", 1],
      ["WARNING", 2],
    ]);
  });

  it("returns an empty list when findings_counts is null/absent", () => {
    expect(presentFindingsSeverities(pr(null))).toEqual([]);
    expect(presentFindingsSeverities(pr(undefined))).toEqual([]);
  });
});

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rev",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "r",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Agent",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 90,
    model: null,
    grounding: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings: [],
    ...overrides,
  };
}

describe("latestFindingsPerAgent", () => {
  it("keeps only the newest review per agent (reviews arrive newest-first)", () => {
    const reviews = [
      review({ id: "r2", agent_id: "a1", findings: [finding({ id: "f2", review_id: "r2" })] }),
      review({ id: "r1", agent_id: "a1", findings: [finding({ id: "f1", review_id: "r1" })] }),
    ];
    expect(latestFindingsPerAgent(reviews).map((f) => f.id)).toEqual(["f2"]);
  });

  it("sums findings across different agents' latest reviews", () => {
    const reviews = [
      review({ id: "r1", agent_id: "security", findings: [finding({ id: "f1", review_id: "r1" })] }),
      review({ id: "r2", agent_id: "perf", findings: [finding({ id: "f2", review_id: "r2" })] }),
    ];
    expect(latestFindingsPerAgent(reviews).map((f) => f.id).sort()).toEqual(["f1", "f2"]);
  });

  it("ignores summary-kind reviews", () => {
    const reviews = [
      review({ id: "r1", kind: "summary", findings: [finding({ id: "f1", review_id: "r1" })] }),
    ];
    expect(latestFindingsPerAgent(reviews)).toEqual([]);
  });
});
