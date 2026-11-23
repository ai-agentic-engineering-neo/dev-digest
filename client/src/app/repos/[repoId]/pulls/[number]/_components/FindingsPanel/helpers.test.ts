import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: `Finding ${id}`,
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

const FINDINGS = [
  finding("s1", "SUGGESTION"),
  finding("c1", "CRITICAL"),
  finding("w1", "WARNING", 0.4), // low confidence
  finding("c2", "CRITICAL"),
  finding("w2", "WARNING"),
];

describe("countBySeverity", () => {
  it("counts findings per level", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 2, WARNING: 2, SUGGESTION: 1 });
  });

  it("returns zeros for every level when there are no findings", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  const ids = (fs: FindingRecord[]) => fs.map((f) => f.id);

  it("without filters keeps everything, sorted by severity", () => {
    expect(ids(visibleFindings(FINDINGS, false))).toEqual(["c1", "c2", "w1", "w2", "s1"]);
    expect(ids(visibleFindings(FINDINGS, false, null))).toEqual(["c1", "c2", "w1", "w2", "s1"]);
  });

  it("keeps only the selected severity", () => {
    expect(ids(visibleFindings(FINDINGS, false, "WARNING"))).toEqual(["w1", "w2"]);
    expect(ids(visibleFindings(FINDINGS, false, "CRITICAL"))).toEqual(["c1", "c2"]);
  });

  it("combines severity with hide-low-confidence (AND)", () => {
    expect(ids(visibleFindings(FINDINGS, true, "WARNING"))).toEqual(["w2"]);
  });
});
