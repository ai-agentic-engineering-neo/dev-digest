import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, filterLowConfidence, visibleFindings } from "./helpers";

function f(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
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
    dismissed_at: null,
  };
}

const LIST = [f("s1", "SUGGESTION"), f("w1", "WARNING", 0.3), f("c1", "CRITICAL"), f("w2", "WARNING")];

describe("countBySeverity", () => {
  it("counts every contract level, zero when missing, no INFO", () => {
    expect(countBySeverity([f("w", "WARNING")])).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    expect(countBySeverity([])).not.toHaveProperty("INFO");
  });
});

describe("filterLowConfidence", () => {
  it("drops findings below the threshold only when on", () => {
    expect(filterLowConfidence(LIST, false)).toHaveLength(4);
    expect(filterLowConfidence(LIST, true).map((x) => x.id)).toEqual(["s1", "c1", "w2"]);
  });
});

describe("visibleFindings", () => {
  it("sorts by severity with no filter", () => {
    expect(visibleFindings(LIST, false).map((x) => x.id)).toEqual(["c1", "w1", "w2", "s1"]);
  });

  it("keeps only the chosen severity", () => {
    expect(visibleFindings(LIST, false, "WARNING").map((x) => x.id)).toEqual(["w1", "w2"]);
  });

  it("combines severity with hide-low-confidence", () => {
    expect(visibleFindings(LIST, true, "WARNING").map((x) => x.id)).toEqual(["w2"]);
  });
});
