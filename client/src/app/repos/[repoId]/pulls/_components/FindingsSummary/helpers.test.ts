import { describe, it, expect } from "vitest";
import { summarizeFindings, totalCount, lineLabel } from "./helpers";

function finding(o: Partial<Parameters<typeof summarizeFindings>[0][number]>) {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "Some finding",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    confidence: 0.8,
    rationale: "Because reasons.",
    dismissed_at: null,
    ...o,
  };
}

describe("summarizeFindings", () => {
  it("groups by severity, a plain count/filter with no side effects", () => {
    const { counts } = summarizeFindings([
      finding({ id: "a", severity: "CRITICAL" }),
      finding({ id: "b", severity: "CRITICAL" }),
      finding({ id: "c", severity: "WARNING" }),
      finding({ id: "d", severity: "SUGGESTION" }),
    ]);
    expect(counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("excludes dismissed findings from counts and items", () => {
    const { counts, items } = summarizeFindings([
      finding({ id: "a", severity: "CRITICAL" }),
      finding({ id: "b", severity: "CRITICAL", dismissed_at: "2026-06-13T20:00:00.000Z" }),
    ]);
    expect(counts.CRITICAL).toBe(1);
    expect(items.map((i) => i.id)).toEqual(["a"]);
  });

  it("sorts items CRITICAL → WARNING → SUGGESTION, then by confidence desc", () => {
    const { items } = summarizeFindings([
      finding({ id: "a", severity: "SUGGESTION", confidence: 0.9 }),
      finding({ id: "b", severity: "CRITICAL", confidence: 0.6 }),
      finding({ id: "c", severity: "CRITICAL", confidence: 0.95 }),
      finding({ id: "d", severity: "WARNING", confidence: 0.7 }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("every count equals the number of items of that severity (invariant)", () => {
    const { counts, items } = summarizeFindings([
      finding({ id: "a", severity: "CRITICAL" }),
      finding({ id: "b", severity: "WARNING" }),
      finding({ id: "c", severity: "WARNING" }),
      finding({ id: "d", severity: "SUGGESTION", dismissed_at: "2026-06-13T20:00:00.000Z" }),
    ]);
    for (const sev of ["CRITICAL", "WARNING", "SUGGESTION"] as const) {
      expect(counts[sev]).toBe(items.filter((i) => i.severity === sev).length);
    }
  });

  it("returns zero counts and no items for an empty list", () => {
    expect(summarizeFindings([])).toEqual({
      counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      items: [],
    });
  });
});

describe("totalCount", () => {
  it("sums all three severities", () => {
    expect(totalCount({ CRITICAL: 2, WARNING: 1, SUGGESTION: 3 })).toBe(6);
  });
});

describe("lineLabel", () => {
  it("shows a single line number when start === end", () => {
    expect(lineLabel({ start_line: 12, end_line: 12 })).toBe("12");
  });

  it("shows a range when start !== end", () => {
    expect(lineLabel({ start_line: 61, end_line: 74 })).toBe("61-74");
  });
});
