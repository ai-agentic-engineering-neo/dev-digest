import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

const f = (id: string, severity: FindingRecord["severity"], confidence = 0.9) =>
  ({ id, severity, confidence }) as FindingRecord;

const DATA = [f("1", "CRITICAL"), f("2", "CRITICAL", 0.3), f("3", "WARNING")];

describe("countBySeverity", () => {
  it("counts per level and zero-fills missing ones", () => {
    expect(countBySeverity(DATA)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 });
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("visibleFindings severity filter", () => {
  it("filters by severity", () => {
    expect(visibleFindings(DATA, false, "WARNING").map((x) => x.id)).toEqual(["3"]);
  });
  it("applies both hideLow and severity", () => {
    expect(visibleFindings(DATA, true, "CRITICAL").map((x) => x.id)).toEqual(["1"]);
  });
  it("null severity keeps all", () => {
    expect(visibleFindings(DATA, false, null)).toHaveLength(3);
  });
});
