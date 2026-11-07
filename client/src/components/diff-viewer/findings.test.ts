import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { activeFindings, lineSeverities, partitionFindings, topSeverity } from "./findings";

function f(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 12,
    end_line: 12,
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
  } as FindingRecord;
}

describe("diff-viewer findings helpers", () => {
  it("partitions findings by rendered RIGHT lines", () => {
    const onLine = f("on", { start_line: 12 });
    const far = f("far", { start_line: 99 });
    const leftOnly = f("left", { start_line: 5 });
    const { matched, outOfPatch } = partitionFindings(
      [onLine, far, leftOnly],
      new Set(["RIGHT:12", "LEFT:5"]),
    );
    expect(matched.get("RIGHT:12")).toEqual([onLine]);
    expect(outOfPatch.map((x) => x.id)).toEqual(["far", "left"]);
  });

  it("orders severities and drops dismissed findings", () => {
    expect(topSeverity([{ severity: "SUGGESTION" }, { severity: "WARNING" }])).toBe("WARNING");
    expect(topSeverity([])).toBeNull();
    expect(
      lineSeverities([{ severity: "SUGGESTION" }, { severity: "CRITICAL" }, { severity: "SUGGESTION" }]),
    ).toEqual(["CRITICAL", "SUGGESTION"]);
    const kept = f("k");
    expect(activeFindings([kept, f("d", { dismissed_at: "2026-01-01T00:00:00Z" })])).toEqual([kept]);
  });
});
