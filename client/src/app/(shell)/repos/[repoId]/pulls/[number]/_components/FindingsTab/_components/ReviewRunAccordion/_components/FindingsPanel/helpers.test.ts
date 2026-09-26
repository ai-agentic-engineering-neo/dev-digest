/**
 * FindingsPanel helpers — the filtering the severity counters drive. (URL
 * parsing of `?severity=` lives with the route: PrDetailView/helpers.)
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { visibleFindings } from "./helpers";

const f = (id: string, severity: string, confidence = 0.9): FindingRecord =>
  ({
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  }) as FindingRecord;

describe("visibleFindings", () => {
  const all = [f("crit", "CRITICAL"), f("warn", "WARNING"), f("sugg", "SUGGESTION", 0.2)];

  it("sorts by severity when no filter is on", () => {
    expect(visibleFindings([all[2]!, all[0]!, all[1]!], false).map((x) => x.id)).toEqual([
      "crit",
      "warn",
      "sugg",
    ]);
  });

  it("keeps only the requested severity", () => {
    expect(visibleFindings(all, false, "WARNING").map((x) => x.id)).toEqual(["warn"]);
  });

  it("stacks with the low-confidence toggle rather than replacing it", () => {
    expect(visibleFindings(all, true, "SUGGESTION")).toEqual([]);
  });
});
;
