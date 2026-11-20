import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

const f = (id: string, severity: FindingRecord["severity"], confidence = 0.9) =>
  ({ id, severity, confidence }) as FindingRecord;

const FINDINGS = [f("s1", "SUGGESTION"), f("w1", "WARNING", 0.5), f("c1", "CRITICAL"), f("w2", "WARNING")];

describe("countBySeverity", () => {
  it("counts every level, zero when absent", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  it("sorts by severity without a severity filter (default arg)", () => {
    expect(visibleFindings(FINDINGS, false).map((x) => x.id)).toEqual(["c1", "w1", "w2", "s1"]);
  });

  it("keeps only the selected severity", () => {
    expect(visibleFindings(FINDINGS, false, "WARNING").map((x) => x.id)).toEqual(["w1", "w2"]);
  });

  it("combines the severity filter with hide-low-confidence", () => {
    expect(visibleFindings(FINDINGS, true, "WARNING").map((x) => x.id)).toEqual(["w2"]);
  });
});
