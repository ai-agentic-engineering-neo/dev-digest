import { describe, it, expect } from "vitest";
import { activeFindings, countBySeverity, effectiveVerdict } from "./findings";
import type { FindingRecord } from "@devdigest/shared";

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: overrides.id ?? Math.random().toString(36),
    severity: "WARNING",
    category: "style",
    title: "t",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  } as FindingRecord;
}

describe("activeFindings", () => {
  it("excludes dismissed findings", () => {
    const findings = [
      finding({ id: "a", dismissed_at: null }),
      finding({ id: "b", dismissed_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(activeFindings(findings).map((f) => f.id)).toEqual(["a"]);
  });

  it("still counts accepted findings as active", () => {
    const findings = [finding({ id: "a", accepted_at: "2026-01-01T00:00:00Z", dismissed_at: null })];
    expect(activeFindings(findings)).toHaveLength(1);
  });
});

describe("countBySeverity", () => {
  it("groups by severity with all three keys always present", () => {
    const findings = [
      finding({ severity: "CRITICAL" }),
      finding({ severity: "CRITICAL" }),
      finding({ severity: "WARNING" }),
    ];
    expect(countBySeverity(findings)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 });
  });

  it("returns all-zero for an empty list", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("is a pure function — does not read dismissed/accepted state itself", () => {
    // countBySeverity counts whatever it's given; callers decide filtering
    // (activeFindings for Phase B's popover, unfiltered for Phase A's pills).
    const findings = [finding({ severity: "SUGGESTION", dismissed_at: "2026-01-01T00:00:00Z" })];
    expect(countBySeverity(findings)).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 });
  });
});

describe("effectiveVerdict", () => {
  it("an active CRITICAL → request_changes", () => {
    expect(effectiveVerdict([finding({ severity: "CRITICAL" }), finding({ severity: "WARNING" })])).toBe(
      "request_changes",
    );
  });

  it("only non-critical active findings → comment", () => {
    expect(effectiveVerdict([finding({ severity: "SUGGESTION" })])).toBe("comment");
  });

  it("no findings → approve (the model's own verdict is irrelevant)", () => {
    expect(effectiveVerdict([])).toBe("approve");
  });

  it("dismissed findings don't count — all dismissed → approve", () => {
    expect(effectiveVerdict([finding({ severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00Z" })])).toBe(
      "approve",
    );
  });
});
