/**
 * Pure helpers for DiffTab (Smart Order, L03): the URL <-> DiffOrder mapping,
 * the "latest review per agent" rule (TP-1, shared with the server's
 * `smart-diff-helpers.test.ts`), the smart-diff role layout, and the
 * per-severity file counts.
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord, PrFile, SmartDiff } from "@devdigest/shared";
import {
  orderFromParam,
  orderToParam,
  findingsByFile,
  layoutSmartGroups,
  filesPerSeverity,
  lineRange,
} from "./helpers";
import { highestSeverity } from "@/lib/severity";

describe("orderFromParam / orderToParam", () => {
  it.each([
    [null, "smart"],
    ["original", "original"],
    ["x", "smart"],
  ] as const)("orderFromParam(%s) -> %s", (param, expected) => {
    expect(orderFromParam(param)).toBe(expected);
  });

  it.each([
    ["smart", null],
    ["original", "original"],
  ] as const)("orderToParam(%s) -> %s", (order, expected) => {
    expect(orderToParam(order)).toBe(expected);
  });
});

/** TP-1 — mirrors `server/test/smart-diff-helpers.test.ts`'s fixture exactly
    (same reviews, same agents, same timestamps). */
function tp1Reviews(): ReviewRecord[] {
  function finding(o: Partial<FindingRecord> & { id: string; file: string; start_line: number }): FindingRecord {
    return {
      severity: "WARNING",
      category: "bug",
      title: `Finding ${o.id}`,
      end_line: o.start_line,
      rationale: "r",
      suggestion: null,
      confidence: 0.8,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "unused",
      accepted_at: null,
      dismissed_at: null,
      ...o,
    };
  }
  function review(o: Partial<ReviewRecord> & { id: string; agent_id: string | null; created_at: string }): ReviewRecord {
    return {
      pr_id: "pr1",
      run_id: null,
      agent_name: null,
      kind: "review",
      verdict: null,
      summary: null,
      score: null,
      model: null,
      grounding: null,
      findings: [],
      ...o,
    };
  }
  return [
    review({
      id: "r1",
      agent_id: "agent-a",
      created_at: "2026-09-01T10:00:00Z",
      findings: [finding({ id: "f1", file: "a.ts", start_line: 10, severity: "CRITICAL", review_id: "r1" })],
    }),
    review({
      id: "r2",
      agent_id: "agent-a",
      created_at: "2026-09-02T10:00:00Z",
      findings: [finding({ id: "f2", file: "a.ts", start_line: 20, severity: "WARNING", review_id: "r2" })],
    }),
    review({
      id: "r3",
      agent_id: "agent-b",
      created_at: "2026-09-01T12:00:00Z",
      findings: [
        finding({
          id: "f3",
          file: "a.ts",
          start_line: 30,
          severity: "SUGGESTION",
          review_id: "r3",
          dismissed_at: "2026-09-03T00:00:00Z",
        }),
        finding({
          id: "f4",
          file: "b.md",
          start_line: 5,
          severity: "WARNING",
          review_id: "r3",
          accepted_at: "2026-09-03T00:00:00Z",
        }),
      ],
    }),
    review({
      id: "r4",
      agent_id: null,
      created_at: "2026-08-30T00:00:00Z",
      findings: [finding({ id: "f5", file: "a.ts", start_line: 40, severity: "CRITICAL", review_id: "r4" })],
    }),
    review({
      id: "r5",
      agent_id: null,
      created_at: "2026-08-31T00:00:00Z",
      findings: [finding({ id: "f6", file: "a.ts", start_line: 50, severity: "SUGGESTION", review_id: "r5" })],
    }),
  ];
}

describe("TP-1 — findingsByFile / highestSeverity (shared fixture)", () => {
  it("a.ts keeps {f2, f3, f6}, b.md keeps {f4} (only the latest review per agent)", () => {
    const byFile = findingsByFile(tp1Reviews());
    expect(new Set(byFile.get("a.ts")!.map((f) => f.id))).toEqual(new Set(["f2", "f3", "f6"]));
    expect(byFile.get("b.md")!.map((f) => f.id)).toEqual(["f4"]);
  });

  it("highestSeverity(a.ts) is WARNING (dismissed f3 excluded, active f2/f6 remain)", () => {
    const byFile = findingsByFile(tp1Reviews());
    expect(highestSeverity(byFile.get("a.ts")!)).toBe("WARNING");
  });
});

function file(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: null };
}

describe("layoutSmartGroups", () => {
  it("keeps files within a group in the PR's original order", () => {
    const smart: SmartDiff = {
      groups: [
        {
          role: "core",
          files: [
            { path: "src/b.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
            { path: "src/a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
          ],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
    };
    const groups = layoutSmartGroups([file("src/b.ts"), file("src/a.ts")], smart);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["src/b.ts", "src/a.ts"]);
  });

  it("a path missing from the smart-diff response falls into core; empty groups are dropped", () => {
    const smart: SmartDiff = {
      groups: [{ role: "docs", files: [{ path: "README.md", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] }],
      split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
    };
    const groups = layoutSmartGroups([file("README.md"), file("src/unknown.ts")], smart);
    expect(groups.map((g) => g.role)).toEqual(["core", "docs"]);
    expect(groups.find((g) => g.role === "core")!.files.map((f) => f.path)).toEqual(["src/unknown.ts"]);
  });
});

describe("filesPerSeverity", () => {
  it("counts a file with {CRITICAL, WARNING, WARNING} once per severity present, and a dismissed severity is excluded", () => {
    const findings: FindingRecord[] = [
      makeFinding({ id: "1", severity: "CRITICAL" }),
      makeFinding({ id: "2", severity: "WARNING" }),
      makeFinding({ id: "3", severity: "WARNING" }),
    ];
    const byFile = new Map<string, FindingRecord[]>([
      ["x.ts", findings],
      ["y.ts", [makeFinding({ id: "4", severity: "WARNING" })]],
    ]);
    const counts = filesPerSeverity([file("x.ts"), file("y.ts")], byFile);
    expect(counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
  });

  it("accepted findings count, dismissed findings do not", () => {
    const byFile = new Map<string, FindingRecord[]>([
      [
        "x.ts",
        [
          makeFinding({ id: "1", severity: "CRITICAL", accepted_at: "2026-09-01T00:00:00Z" }),
          makeFinding({ id: "2", severity: "WARNING", dismissed_at: "2026-09-01T00:00:00Z" }),
        ],
      ],
    ]);
    const counts = filesPerSeverity([file("x.ts")], byFile);
    expect(counts).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("lineRange", () => {
  it("returns just the number when start and end are the same line", () => {
    expect(lineRange({ start_line: 5, end_line: 5 })).toBe("5");
  });

  it("returns start-end when the finding spans multiple lines", () => {
    expect(lineRange({ start_line: 61, end_line: 74 })).toBe("61-74");
  });
});

function makeFinding(o: Partial<FindingRecord> & { id: string; severity: FindingRecord["severity"] }): FindingRecord {
  return {
    category: "bug",
    title: `Finding ${o.id}`,
    file: "x.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}
