import { describe, it, expect } from "vitest";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

function f(id: string, severity: Severity, confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "a.ts",
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

const LIST = [f("s", "SUGGESTION"), f("c", "CRITICAL", 0.3), f("w", "WARNING"), f("c2", "CRITICAL")];

describe("countBySeverity", () => {
  it("counts every severity, zero for absent ones", () => {
    expect(countBySeverity(LIST)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  it("sorts by severity and keeps everything by default", () => {
    expect(visibleFindings(LIST, false).map((x) => x.id)).toEqual(["c", "c2", "w", "s"]);
  });

  it("filters by severity, combined with hide-low", () => {
    expect(visibleFindings(LIST, false, "CRITICAL").map((x) => x.id)).toEqual(["c", "c2"]);
    expect(visibleFindings(LIST, true, "CRITICAL").map((x) => x.id)).toEqual(["c2"]);
  });
});
