import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const RUN = [
  finding("w-low", "WARNING", 0.4),
  finding("c1", "CRITICAL"),
  finding("s1", "SUGGESTION"),
  finding("w1", "WARNING"),
  finding("c-low", "CRITICAL", 0.3),
];

describe("countBySeverity", () => {
  it("counts every finding per level", () => {
    expect(countBySeverity(RUN)).toEqual({ CRITICAL: 2, WARNING: 2, SUGGESTION: 1 });
  });

  it("returns 0 for every level when the run has no findings", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("ignores severities outside the contract", () => {
    const stray = { ...finding("i1", "SUGGESTION"), severity: "INFO" } as unknown as FindingRecord;
    expect(countBySeverity([stray, finding("w1", "WARNING")])).toEqual({
      CRITICAL: 0,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });
});

describe("visibleFindings", () => {
  const ids = (fs: FindingRecord[]) => fs.map((f) => f.id);

  it("with no filters keeps everything, sorted by severity", () => {
    expect(ids(visibleFindings(RUN, false))).toEqual(["c1", "c-low", "w-low", "w1", "s1"]);
    expect(ids(visibleFindings(RUN, false, null))).toEqual(["c1", "c-low", "w-low", "w1", "s1"]);
  });

  it("keeps only the selected severity", () => {
    expect(ids(visibleFindings(RUN, false, "WARNING"))).toEqual(["w-low", "w1"]);
  });

  it("hides low confidence on its own", () => {
    expect(ids(visibleFindings(RUN, true))).toEqual(["c1", "w1", "s1"]);
  });

  it("combines severity and hide-low-confidence with AND", () => {
    expect(ids(visibleFindings(RUN, true, "CRITICAL"))).toEqual(["c1"]);
  });

  it("returns an empty list when the selected level has no findings", () => {
    expect(visibleFindings([finding("c1", "CRITICAL")], false, "SUGGESTION")).toEqual([]);
  });
});
