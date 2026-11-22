import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence: number): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: `finding ${id}`,
    file: "src/a.ts",
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

const FINDINGS = [
  finding("w-high", "WARNING", 0.9),
  finding("c-high", "CRITICAL", 0.95),
  finding("w-low", "WARNING", 0.4),
];

describe("countBySeverity", () => {
  it("counts each level and reports 0 for a level with no findings", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  it("keeps only the chosen severity", () => {
    const shown = visibleFindings(FINDINGS, { hideLow: false, severity: "WARNING" });
    expect(shown.map((f) => f.id)).toEqual(["w-high", "w-low"]);
  });

  it("applies the severity filter together with hide-low-confidence", () => {
    const shown = visibleFindings(FINDINGS, { hideLow: true, severity: "WARNING" });
    expect(shown.map((f) => f.id)).toEqual(["w-high"]);
  });

  it("returns every finding, most severe first, when no filter is set", () => {
    const shown = visibleFindings(FINDINGS, { hideLow: false, severity: null });
    expect(shown.map((f) => f.id)).toEqual(["c-high", "w-high", "w-low"]);
  });
});
