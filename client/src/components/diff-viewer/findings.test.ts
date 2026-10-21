import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { parsePatch } from "./helpers";
import { anchorFindings, hasOpenFindings, strongestSeverity } from "./findings";

const PATCH = ["@@ -9,3 +9,5 @@", " a", " b", "+c", "+d", " e"].join("\n");
// rendered indexes: 0 hunk, 1 ctx(9), 2 ctx(10), 3 add(11), 4 add(12), 5 ctx(13)
const lines = parsePatch(PATCH);

const f = (over: Partial<FindingRecord>): FindingRecord => ({
  id: "f1",
  severity: "WARNING",
  category: "bug",
  title: "t",
  file: "a.ts",
  start_line: 11,
  end_line: 11,
  rationale: "r",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});

describe("anchorFindings", () => {
  it("anchors a single-line finding with stripe, pill and comment on the same line", () => {
    const a = anchorFindings([f({})], lines);
    expect(a.stripe.get(3)).toBe("WARNING");
    expect(a.pill.get(3)).toBe("WARNING");
    expect(a.after.get(3)?.map((x) => x.id)).toEqual(["f1"]);
    expect(a.unanchored).toEqual([]);
  });

  it("anchors a range that is partly in the patch to the rendered lines", () => {
    const a = anchorFindings([f({ start_line: 12, end_line: 40 })], lines);
    expect([...a.stripe.keys()]).toEqual([4, 5]);
    expect([...a.pill.keys()]).toEqual([4]);
    expect([...a.after.keys()]).toEqual([5]);
  });

  it("puts out-of-patch and null-patch findings in the unanchored bucket", () => {
    expect(anchorFindings([f({ start_line: 99, end_line: 99 })], lines).unanchored).toHaveLength(1);
    expect(anchorFindings([f({})], parsePatch(null)).unanchored).toHaveLength(1);
  });

  it("keeps the strongest severity when findings overlap", () => {
    const a = anchorFindings(
      [f({ id: "w", severity: "WARNING" }), f({ id: "c", severity: "CRITICAL" }), f({ id: "i", severity: "SUGGESTION" })],
      lines,
    );
    expect(a.stripe.get(3)).toBe("CRITICAL");
    expect(a.after.get(3)).toHaveLength(3);
  });

  it("still anchors a dismissed finding's comment but gives it no stripe or pill", () => {
    const a = anchorFindings([f({ dismissed_at: "2026-01-01" })], lines);
    expect(a.after.get(3)).toHaveLength(1);
    expect(a.stripe.size).toBe(0);
    expect(a.pill.size).toBe(0);
  });
});

describe("helpers", () => {
  it("hasOpenFindings ignores dismissed findings", () => {
    expect(hasOpenFindings([f({ dismissed_at: "x" })])).toBe(false);
    expect(hasOpenFindings([f({ dismissed_at: "x" }), f({ id: "2" })])).toBe(true);
  });
  it("strongestSeverity ranks CRITICAL above WARNING", () => {
    expect(strongestSeverity("WARNING", "CRITICAL")).toBe("CRITICAL");
    expect(strongestSeverity("CRITICAL", "INFO")).toBe("CRITICAL");
    expect(strongestSeverity(undefined, "INFO")).toBe("INFO");
  });
});
