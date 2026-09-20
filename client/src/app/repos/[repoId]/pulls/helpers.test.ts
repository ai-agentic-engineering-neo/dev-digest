import { describe, it, expect } from "vitest";
import type { PrMeta } from "@devdigest/shared";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import { presentFindingsSeverities, latestFindingsPerAgent, filterPulls, countPulls } from "./helpers";

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

function listPr(overrides: Partial<PrMeta>): PrMeta {
  return {
    id: overrides.id ?? "pr",
    number: 1,
    title: "Fix the thing",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "sha",
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: "needs_review",
    updated_at: "2026-01-01T00:00:00.000Z",
    findings_counts: null,
    ...overrides,
  } as PrMeta;
}

describe("filterPulls", () => {
  it("keeps everything when status is 'all'", () => {
    const pulls = [listPr({ number: 1, status: "needs_review" }), listPr({ number: 2, status: "merged" })];
    expect(filterPulls(pulls, { status: "all", query: "", sort: "newest" })).toHaveLength(2);
  });

  it("filters by exact status match", () => {
    const pulls = [listPr({ number: 1, status: "needs_review" }), listPr({ number: 2, status: "merged" })];
    const result = filterPulls(pulls, { status: "merged", query: "", sort: "newest" });
    expect(result.map((p) => p.number)).toEqual([2]);
  });

  it("matches an empty query against everything", () => {
    const pulls = [listPr({ number: 1 }), listPr({ number: 2 })];
    expect(filterPulls(pulls, { status: "all", query: "", sort: "newest" })).toHaveLength(2);
  });

  it("matches query case-insensitively by title", () => {
    const pulls = [listPr({ number: 1, title: "Add Retry Logic" }), listPr({ number: 2, title: "Unrelated" })];
    const result = filterPulls(pulls, { status: "all", query: "retry", sort: "newest" });
    expect(result.map((p) => p.number)).toEqual([1]);
  });

  it("matches query by PR number", () => {
    const pulls = [listPr({ number: 42, title: "Something" }), listPr({ number: 7, title: "Other" })];
    const result = filterPulls(pulls, { status: "all", query: "42", sort: "newest" });
    expect(result.map((p) => p.number)).toEqual([42]);
  });

  it("sorts newest first by default, using updated_at", () => {
    const pulls = [
      listPr({ number: 1, updated_at: "2026-01-01T00:00:00.000Z" }),
      listPr({ number: 2, updated_at: "2026-03-01T00:00:00.000Z" }),
    ];
    const result = filterPulls(pulls, { status: "all", query: "", sort: "newest" });
    expect(result.map((p) => p.number)).toEqual([2, 1]);
  });

  it("sorts oldest first when requested", () => {
    const pulls = [
      listPr({ number: 1, updated_at: "2026-01-01T00:00:00.000Z" }),
      listPr({ number: 2, updated_at: "2026-03-01T00:00:00.000Z" }),
    ];
    const result = filterPulls(pulls, { status: "all", query: "", sort: "oldest" });
    expect(result.map((p) => p.number)).toEqual([1, 2]);
  });

  it("treats missing or unparseable updated_at as oldest (epoch 0)", () => {
    const pulls = [
      listPr({ number: 1, updated_at: null as unknown as string }),
      listPr({ number: 2, updated_at: "not-a-date" }),
      listPr({ number: 3, updated_at: "2026-01-01T00:00:00.000Z" }),
    ];
    const result = filterPulls(pulls, { status: "all", query: "", sort: "newest" });
    expect(result[0]!.number).toBe(3);
    expect(result.map((p) => p.number).sort()).toEqual([1, 2, 3]);
  });
});

describe("countPulls", () => {
  it("counts open (needs_review/reviewed/stale) and needs_review separately", () => {
    const pulls = [
      listPr({ number: 1, status: "needs_review" }),
      listPr({ number: 2, status: "reviewed" }),
      listPr({ number: 3, status: "stale" }),
      listPr({ number: 4, status: "merged" }),
      listPr({ number: 5, status: "closed" }),
    ];
    expect(countPulls(pulls)).toEqual({ openCount: 3, needsReviewCount: 1 });
  });

  it("returns zero counts for an empty list", () => {
    expect(countPulls([])).toEqual({ openCount: 0, needsReviewCount: 0 });
  });
});

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
