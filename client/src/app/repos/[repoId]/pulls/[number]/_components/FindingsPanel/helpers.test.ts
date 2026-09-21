import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countsBySeverity, visibleFindings } from "./helpers";

const f = (id: string, severity: string, confidence = 0.9) =>
  ({ id, severity, confidence } as unknown as FindingRecord);

describe("countsBySeverity", () => {
  it("counts each level and reports absent ones as 0", () => {
    expect(countsBySeverity([f("1", "CRITICAL"), f("2", "WARNING"), f("3", "WARNING")]))
      .toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
  });

  it("ignores a severity outside the three canonical levels", () => {
    expect(countsBySeverity([f("1", "INFO"), f("2", "CRITICAL")]))
      .toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  const all = [f("1", "CRITICAL"), f("2", "WARNING"), f("3", "SUGGESTION", 0.3)];

  it("returns everything when no severity is selected", () => {
    expect(visibleFindings(all, false, new Set()).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("defaults to no severity narrowing when the third argument is omitted", () => {
    expect(visibleFindings(all, false).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("sorts unsorted input by severity", () => {
    const unsorted = [f("1", "SUGGESTION"), f("2", "CRITICAL"), f("3", "WARNING")];
    expect(visibleFindings(unsorted, false, new Set()).map((x) => x.id)).toEqual(["2", "3", "1"]);
  });

  it("keeps only the selected severities", () => {
    expect(visibleFindings(all, false, new Set(["WARNING"])).map((x) => x.id)).toEqual(["2"]);
  });

  it("unions two selected severities", () => {
    expect(visibleFindings(all, false, new Set(["CRITICAL", "SUGGESTION"])).map((x) => x.id))
      .toEqual(["1", "3"]);
  });

  it("applies confidence before severity", () => {
    expect(visibleFindings(all, true, new Set(["SUGGESTION"]))).toEqual([]);
  });
});
