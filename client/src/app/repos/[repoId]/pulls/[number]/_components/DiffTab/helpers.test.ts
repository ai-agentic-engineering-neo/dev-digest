import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord, SmartDiff } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { commentedPaths, currentFindings, groupFiles, totals } from "./helpers";

function file(path: string, additions = 1, deletions = 0): PrFile {
  return { path, additions, deletions, patch: null };
}

function smartDiff(groups: SmartDiff["groups"]): SmartDiff {
  return { groups, split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } };
}

function finding(id: string, file: string, severity: FindingRecord["severity"]): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file,
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
  };
}

function review(id: string, agentId: string | null, findings: FindingRecord[], kind: ReviewRecord["kind"] = "review"): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: null,
    kind,
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-06-01T00:00:00Z",
    findings,
  };
}

describe("currentFindings", () => {
  it("takes each agent's newest review (list is newest-first) and skips summaries", () => {
    const reviews = [
      review("a2", "A", [finding("a-new", "x.ts", "WARNING")]),
      review("s1", "B", [finding("summary", "x.ts", "CRITICAL")], "summary"),
      review("b1", "B", [finding("b", "x.ts", "SUGGESTION")]),
      review("a1", "A", [finding("a-old", "x.ts", "CRITICAL")]),
    ];
    expect(currentFindings(reviews).map((f) => f.id)).toEqual(["a-new", "b"]);
    expect(currentFindings(undefined)).toEqual([]);
  });
});

describe("groupFiles", () => {
  it("drops empty groups and orders the non-empty ones as the server did", () => {
    const sd = smartDiff([
      { role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "tests", files: [] },
      { role: "wiring", files: [] },
      { role: "docs", files: [] },
      { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
    ]);
    const groups = groupFiles([file("a.ts"), file("pnpm-lock.yaml")], sd);
    expect(groups.map((g) => g.role)).toEqual(["core", "boilerplate"]);
  });

  it("matches real PrFiles by path and counts the group's findings per severity", () => {
    const sd = smartDiff([
      {
        role: "core",
        files: [
          { path: "a.ts", additions: 1, deletions: 0, finding_lines: [5] },
          { path: "b.ts", additions: 1, deletions: 0, finding_lines: [] },
        ],
      },
    ]);
    const findings = [finding("1", "a.ts", "WARNING"), finding("2", "a.ts", "WARNING"), finding("3", "other.ts", "CRITICAL")];
    const groups = groupFiles([file("a.ts"), file("b.ts")], sd, findings);
    expect(groups[0]).toMatchObject({ role: "core", counts: [{ severity: "WARNING", count: 2 }] });
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("orders a group's files by their most severe finding, keeping the server order on ties", () => {
    const paths = ["none-1.ts", "sugg.ts", "crit.ts", "none-2.ts", "warn.ts"];
    const sd = smartDiff([
      { role: "core", files: paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })) },
    ]);
    const findings = [
      finding("1", "sugg.ts", "SUGGESTION"),
      finding("2", "warn.ts", "WARNING"),
      finding("3", "warn.ts", "SUGGESTION"),
      finding("4", "crit.ts", "SUGGESTION"),
      finding("5", "crit.ts", "CRITICAL"),
    ];
    const groups = groupFiles(paths.map((p) => file(p)), sd, findings);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["crit.ts", "warn.ts", "sugg.ts", "none-1.ts", "none-2.ts"]);
  });

  it("puts a file the smart-diff response doesn't know about into core", () => {
    const sd = smartDiff([{ role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, finding_lines: [] }] }]);
    const groups = groupFiles([file("a.ts"), file("new-file.ts")], sd);
    const core = groups.find((g) => g.role === "core")!;
    expect(core.files.map((f) => f.path)).toEqual(["a.ts", "new-file.ts"]);
  });

  it("falls back to a single core group when smartDiff is not loaded yet", () => {
    const groups = groupFiles([file("a.ts"), file("b.ts")], undefined);
    expect(groups).toEqual([{ role: "core", files: [file("a.ts"), file("b.ts")], counts: [] }]);
  });
});

describe("commentedPaths", () => {
  it("joins GitHub comment paths and finding files, without duplicates", () => {
    const paths = commentedPaths([{ path: "a.ts" }, { path: "a.ts" }], [{ file: "b.ts" }, { file: "a.ts" }]);
    expect([...paths].sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("treats not-yet-loaded comments as none", () => {
    expect([...commentedPaths(undefined, [])]).toEqual([]);
  });
});

describe("totals", () => {
  it("sums files/additions/deletions", () => {
    expect(totals([file("a.ts", 10, 2), file("b.ts", 3, 1)])).toEqual({ files: 2, additions: 13, deletions: 3 });
    expect(totals([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});
