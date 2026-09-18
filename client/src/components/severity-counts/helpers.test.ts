/**
 * The invariant worth guarding: a DISMISSED finding must not be counted. The
 * counter answers "what still needs attention", so dismissing the last finding
 * of a severity has to drop that chip entirely rather than leave a stale number.
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { severityCounts, sortBySeverity } from "./helpers";

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "s1", severity: "SUGGESTION" }),
  finding({ id: "c1", severity: "CRITICAL" }),
  finding({ id: "w1", severity: "WARNING" }),
  finding({ id: "c2", severity: "CRITICAL" }),
];

describe("severityCounts", () => {
  it("tallies per severity", () => {
    expect(severityCounts(FINDINGS)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("skips dismissed findings", () => {
    const withDismissed = [...FINDINGS, finding({ id: "c3", severity: "CRITICAL", dismissed_at: "2026-09-17T00:00:00Z" })];
    expect(severityCounts(withDismissed).CRITICAL).toBe(2);
  });

  it("drops a severity entirely once its only finding is dismissed", () => {
    const counts = severityCounts([
      finding({ id: "w1", severity: "WARNING", dismissed_at: "2026-09-17T00:00:00Z" }),
      finding({ id: "c1", severity: "CRITICAL" }),
    ]);
    expect(counts.WARNING).toBeUndefined();
    expect(counts.CRITICAL).toBe(1);
  });

  it("still counts ACCEPTED findings — only dismissal suppresses one", () => {
    const counts = severityCounts([finding({ severity: "CRITICAL", accepted_at: "2026-09-17T00:00:00Z" })]);
    expect(counts.CRITICAL).toBe(1);
  });

  it("returns an empty tally for no findings", () => {
    expect(severityCounts([])).toEqual({});
  });
});

describe("sortBySeverity", () => {
  it("orders CRITICAL → WARNING → SUGGESTION", () => {
    expect(sortBySeverity(FINDINGS).map((f) => f.severity)).toEqual([
      "CRITICAL",
      "CRITICAL",
      "WARNING",
      "SUGGESTION",
    ]);
  });

  // The contract enum has three values, but findings.severity is a plain text
  // column with no check constraint — a stray value must sort last, not crash.
  it("puts unknown severities last and does not mutate the input", () => {
    const input = [
      finding({ id: "x", severity: "INFO" as FindingRecord["severity"] }),
      finding({ id: "c", severity: "CRITICAL" }),
    ];
    expect(sortBySeverity(input).map((f) => f.id)).toEqual(["c", "x"]);
    expect(input.map((f) => f.id)).toEqual(["x", "c"]);
  });
});
