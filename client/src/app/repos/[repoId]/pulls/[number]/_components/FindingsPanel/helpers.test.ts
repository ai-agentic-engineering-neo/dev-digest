import { describe, it, expect } from "vitest";
import { countBySeverity, visibleFindings } from "./helpers";
import { MIXED, finding } from "./fixtures.test-data";

describe("countBySeverity", () => {
  it("counts per severity, most severe first", () => {
    expect(countBySeverity(MIXED)).toEqual([
      { severity: "CRITICAL", count: 1 },
      { severity: "WARNING", count: 2 },
      { severity: "SUGGESTION", count: 1 },
    ]);
  });

  it("omits severities with zero findings", () => {
    expect(countBySeverity([finding("a", "SUGGESTION"), finding("b", "WARNING")])).toEqual([
      { severity: "WARNING", count: 1 },
      { severity: "SUGGESTION", count: 1 },
    ]);
  });

  it("returns [] for no findings", () => {
    expect(countBySeverity([])).toEqual([]);
  });
});

describe("visibleFindings", () => {
  const ids = (fs: { id: string }[]) => fs.map((f) => f.id);

  it("without a severity filter keeps everything, sorted by severity (regression)", () => {
    expect(ids(visibleFindings(MIXED, false))).toEqual(["c1", "w1", "w2", "s1"]);
    expect(ids(visibleFindings(MIXED, false, null))).toEqual(["c1", "w1", "w2", "s1"]);
  });

  it("hide-low alone drops low-confidence findings", () => {
    expect(ids(visibleFindings(MIXED, true))).toEqual(["c1", "w1", "s1"]);
  });

  it("keeps only the selected severity", () => {
    expect(ids(visibleFindings(MIXED, false, "WARNING"))).toEqual(["w1", "w2"]);
  });

  it("combines the severity filter with hide-low", () => {
    expect(ids(visibleFindings(MIXED, true, "WARNING"))).toEqual(["w1"]);
  });

  it("does not mutate the input", () => {
    const input = [...MIXED];
    visibleFindings(input, true, "WARNING");
    expect(input).toEqual(MIXED);
  });
});
