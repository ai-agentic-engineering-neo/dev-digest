import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { filterBySeverity, severityCounts, visibleFindings } from "./helpers";

const f = (id: string, severity: FindingRecord["severity"], confidence = 0.9) =>
  ({ id, severity, confidence }) as FindingRecord;

const LIST = [f("s1", "SUGGESTION"), f("c1", "CRITICAL"), f("w1", "WARNING"), f("c2", "CRITICAL", 0.3)];

describe("severityCounts", () => {
  it("groups by severity in CRITICAL → WARNING → SUGGESTION order", () => {
    expect(severityCounts(LIST)).toEqual([
      { severity: "CRITICAL", count: 2 },
      { severity: "WARNING", count: 1 },
      { severity: "SUGGESTION", count: 1 },
    ]);
  });

  it("omits severities with no findings", () => {
    expect(severityCounts([f("w1", "WARNING")])).toEqual([{ severity: "WARNING", count: 1 }]);
    expect(severityCounts([])).toEqual([]);
  });
});

describe("filterBySeverity", () => {
  it("keeps only the selected level", () => {
    expect(filterBySeverity(LIST, "CRITICAL").map((x) => x.id)).toEqual(["c1", "c2"]);
  });

  it("returns the list unchanged when no level is selected", () => {
    expect(filterBySeverity(LIST, null)).toBe(LIST);
  });
});

describe("visibleFindings", () => {
  it("drops low confidence and sorts by severity", () => {
    expect(visibleFindings(LIST, true).map((x) => x.id)).toEqual(["c1", "w1", "s1"]);
  });
});
