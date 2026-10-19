import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { severityCounts, visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
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
  finding("w1", "WARNING", 0.3),
  finding("c1", "CRITICAL"),
  finding("w2", "WARNING"),
];

describe("severityCounts", () => {
  it("counts every contract severity, including zeros", () => {
    expect(severityCounts(FINDINGS, false)).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
    expect(severityCounts([], false)).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("applies the low-confidence filter first", () => {
    expect(severityCounts(FINDINGS, true)).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
  });
});

describe("visibleFindings", () => {
  it("sorts by severity when no level is selected", () => {
    expect(visibleFindings(FINDINGS, false).map((f) => f.id)).toEqual(["c1", "w1", "w2", "s1"]);
  });

  it("keeps only the selected severity, after the low-confidence filter", () => {
    expect(visibleFindings(FINDINGS, false, "WARNING").map((f) => f.id)).toEqual(["w1", "w2"]);
    expect(visibleFindings(FINDINGS, true, "WARNING").map((f) => f.id)).toEqual(["w2"]);
  });
});
