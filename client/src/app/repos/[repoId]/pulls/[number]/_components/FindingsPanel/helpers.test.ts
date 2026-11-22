import { describe, it, expect } from "vitest";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { applyConfidence, countBySeverity, visibleFindings, visibleLevels } from "./helpers";

function mk(id: string, severity: Severity, confidence = 0.9, dismissed = false): FindingRecord {
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
    dismissed_at: dismissed ? "2026-11-22T00:00:00Z" : null,
  };
}

const RUN = [
  mk("s1", "SUGGESTION"),
  mk("w1", "WARNING"),
  mk("c1", "CRITICAL", 0.95, true),
  mk("w2", "WARNING", 0.5),
  mk("w3", "WARNING"),
];

describe("countBySeverity", () => {
  it("counts every contract level, dismissed included", () => {
    expect(countBySeverity(RUN)).toEqual({ CRITICAL: 1, WARNING: 3, SUGGESTION: 1 });
  });

  it("returns zeros for an empty run", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("ignores severities outside the contract", () => {
    const odd = { ...mk("i1", "WARNING"), severity: "INFO" } as unknown as FindingRecord;
    expect(countBySeverity([odd])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("follows the confidence filter when given its output", () => {
    expect(countBySeverity(applyConfidence(RUN, true)).WARNING).toBe(2);
  });
});

describe("visibleFindings", () => {
  const ids = (fs: FindingRecord[]) => fs.map((f) => f.id);

  it("without filters keeps all, sorted by severity", () => {
    expect(ids(visibleFindings(RUN, false))).toEqual(["c1", "w1", "w2", "w3", "s1"]);
  });

  it("filters by severity only", () => {
    expect(ids(visibleFindings(RUN, false, "WARNING"))).toEqual(["w1", "w2", "w3"]);
  });

  it("filters by confidence only", () => {
    expect(ids(visibleFindings(RUN, true))).toEqual(["c1", "w1", "w3", "s1"]);
  });

  it("applies both filters at once", () => {
    expect(ids(visibleFindings(RUN, true, "WARNING"))).toEqual(["w1", "w3"]);
  });
});

describe("visibleLevels", () => {
  it("hides zero levels and keeps the fixed order", () => {
    expect(visibleLevels({ CRITICAL: 0, WARNING: 2, SUGGESTION: 2 }, null)).toEqual([
      "WARNING",
      "SUGGESTION",
    ]);
  });

  it("keeps the active level visible at zero", () => {
    expect(visibleLevels({ CRITICAL: 0, WARNING: 2, SUGGESTION: 0 }, "CRITICAL")).toEqual([
      "CRITICAL",
      "WARNING",
    ]);
  });
});
