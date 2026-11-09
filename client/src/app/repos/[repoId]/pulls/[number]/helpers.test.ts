import { describe, it, expect } from "vitest";
import { diffFocusFrom, reviewCounts, withDiffFocus, withTab } from "./helpers";

describe("reviewCounts", () => {
  it("counts all findings and only open criticals as blockers", () => {
    expect(
      reviewCounts([
        { severity: "CRITICAL", dismissed_at: null },
        { severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00Z" },
        { severity: "WARNING", dismissed_at: null },
      ]),
    ).toEqual({ findings: 3, blockers: 1 });
    expect(reviewCounts([])).toEqual({ findings: 0, blockers: 0 });
  });
});

describe("diff focus URL helpers", () => {
  it("round-trips a line target and keeps other params", () => {
    const qs = withDiffFocus("tab=overview&trace=r1", "src/a.ts", { start: 38, end: 50 });
    const p = new URLSearchParams(qs);
    expect(p.get("trace")).toBe("r1");
    expect(diffFocusFrom(p)).toEqual({ path: "src/a.ts", lines: { start: 38, end: 50 } });
  });

  it("drops line params for a file-level target and on tab change", () => {
    const qs = withDiffFocus("line=3&lineEnd=4", "x.ts", null);
    expect(qs).not.toContain("line");
    expect(withTab("tab=diff&file=x&line=3&lineEnd=4", "overview")).toBe("tab=overview");
  });

  it("rejects invalid lines and clamps a bad end", () => {
    for (const bad of ["0", "-3", "abc"]) {
      expect(diffFocusFrom(new URLSearchParams(`file=a&line=${bad}`)).lines).toBeNull();
    }
    expect(diffFocusFrom(new URLSearchParams("line=5")).lines).toBeNull();
    expect(diffFocusFrom(new URLSearchParams("file=a&line=5&lineEnd=2")).lines).toEqual({ start: 5, end: 5 });
  });
});
