import { describe, it, expect } from "vitest";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countBySeverity, visibleFindings, confidentFindings, groupBySeverity } from "./helpers";

const f = (id: string, severity: Severity, confidence = 0.9): FindingRecord => ({
  id,
  severity,
  category: "bug",
  title: id,
  file: "src/a.ts",
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
});

const LIST = [
  f("s1", "SUGGESTION"),
  f("c1", "CRITICAL"),
  f("w1", "WARNING", 0.3),
  f("w2", "WARNING"),
  f("c2", "CRITICAL", 0.4),
];

describe("countBySeverity", () => {
  it("counts each level and keeps zeros", () => {
    expect(countBySeverity(LIST)).toEqual({ CRITICAL: 2, WARNING: 2, SUGGESTION: 1 });
    expect(countBySeverity([f("w", "WARNING")])).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
  });

  it("returns all zeros for an empty list", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  it("without a severity keeps everything, sorted most severe first", () => {
    expect(visibleFindings(LIST, false).map((x) => x.severity)).toEqual([
      "CRITICAL",
      "CRITICAL",
      "WARNING",
      "WARNING",
      "SUGGESTION",
    ]);
  });

  it("keeps only the selected severity", () => {
    expect(visibleFindings(LIST, false, "WARNING").map((x) => x.id)).toEqual(["w1", "w2"]);
  });

  it("combines hide-low-confidence with the severity filter", () => {
    expect(visibleFindings(LIST, true, "CRITICAL").map((x) => x.id)).toEqual(["c1"]);
  });

  it("counts after the confidence filter match the filtered list length per level", () => {
    const counts = countBySeverity(confidentFindings(LIST, true));
    for (const sev of ["CRITICAL", "WARNING", "SUGGESTION"] as const) {
      expect(visibleFindings(LIST, true, sev)).toHaveLength(counts[sev]);
    }
  });
});

describe("groupBySeverity", () => {
  it("splits a severity-sorted list into one group per severity, skipping empty ones", () => {
    const sorted = visibleFindings([f("s1", "SUGGESTION"), f("c1", "CRITICAL"), f("s2", "SUGGESTION")], false);
    expect(groupBySeverity(sorted).map((g) => [g.severity, g.findings.map((x) => x.id)])).toEqual([
      ["CRITICAL", ["c1"]],
      ["SUGGESTION", ["s1", "s2"]],
    ]);
  });

  it("returns no groups for no findings", () => {
    expect(groupBySeverity([])).toEqual([]);
  });
});
