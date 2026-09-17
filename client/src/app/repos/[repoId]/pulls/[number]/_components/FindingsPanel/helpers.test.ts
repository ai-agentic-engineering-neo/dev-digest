import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { visibleFindings, severityCounts } from "./helpers";

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
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("severityCounts", () => {
  it("counts findings grouped by severity", () => {
    const findings = [
      finding({ id: "1", severity: "CRITICAL" }),
      finding({ id: "2", severity: "CRITICAL" }),
      finding({ id: "3", severity: "WARNING" }),
      finding({ id: "4", severity: "SUGGESTION" }),
    ];
    expect(severityCounts(findings)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("omits severities with zero findings", () => {
    const findings = [finding({ id: "1", severity: "CRITICAL" })];
    expect(severityCounts(findings)).toEqual({ CRITICAL: 1 });
  });

  it("returns an empty object for no findings", () => {
    expect(severityCounts([])).toEqual({});
  });
});

describe("visibleFindings with severity filter", () => {
  const findings = [
    finding({ id: "1", severity: "CRITICAL", confidence: 0.9 }),
    finding({ id: "2", severity: "WARNING", confidence: 0.9 }),
    finding({ id: "3", severity: "WARNING", confidence: 0.5 }),
    finding({ id: "4", severity: "SUGGESTION", confidence: 0.9 }),
  ];

  it("returns everything when severity is null", () => {
    expect(visibleFindings(findings, false, null).map((f) => f.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("filters to only the selected severity", () => {
    expect(visibleFindings(findings, false, "WARNING").map((f) => f.id)).toEqual(["2", "3"]);
  });

  it("applies hideLow before the severity filter", () => {
    expect(visibleFindings(findings, true, "WARNING").map((f) => f.id)).toEqual(["2"]);
  });
});
