import { describe, it, expect } from "vitest";
import { countPulls, filterPulls, formatFindingLocation, statusColor } from "./helpers";
import type { PrMeta } from "./constants";

const base = (o: Partial<PrMeta>): PrMeta => ({
  number: 1, title: "t", author: "a", branch: "b", base: "main", head_sha: "h",
  additions: 0, deletions: 0, files_count: 0, status: "reviewed", ...o,
});
const OK = "var(--ok)";

describe("statusColor", () => {
  it("turns a reviewed PR red when an open CRITICAL remains", () => {
    expect(statusColor(base({ findings: { critical: 1, warning: 3, suggestion: 0 } }), OK)).toBe("var(--crit)");
  });
  it("turns a reviewed PR orange when only WARNINGs remain", () => {
    expect(statusColor(base({ findings: { critical: 0, warning: 2, suggestion: 5 } }), OK)).toBe("var(--warn)");
  });
  it("keeps green when only suggestions (or nothing) remain", () => {
    expect(statusColor(base({ findings: { critical: 0, warning: 0, suggestion: 4 } }), OK)).toBe(OK);
    expect(statusColor(base({ findings: null }), OK)).toBe(OK);
  });
  it("leaves non-reviewed statuses alone", () => {
    const f = { critical: 5, warning: 0, suggestion: 0 };
    expect(statusColor(base({ status: "needs_review", findings: f }), "var(--warn)")).toBe("var(--warn)");
    expect(statusColor(base({ status: "stale", findings: f }), "var(--stale)")).toBe("var(--stale)");
  });
});

describe("formatFindingLocation", () => {
  it("formats single lines and ranges", () => {
    expect(formatFindingLocation({ file: "x.ts", start_line: 4, end_line: 4 })).toBe("x.ts:4");
    expect(formatFindingLocation({ file: "x.ts", start_line: 4, end_line: 9 })).toBe("x.ts:4–9");
  });
});

describe("filterPulls", () => {
  const pulls = [
    base({ number: 1, title: "Fix login", status: "needs_review", updated_at: "2026-01-01T00:00:00Z" }),
    base({ number: 2, title: "Add cache", status: "reviewed", updated_at: "2026-01-03T00:00:00Z" }),
    base({ number: 3, title: "Bump deps", status: "needs_review", updated_at: "2026-01-02T00:00:00Z" }),
  ];
  const ids = (ps: PrMeta[]) => ps.map((p) => p.number);

  it("keeps everything for 'all', newest first", () => {
    expect(ids(filterPulls(pulls, { status: "all", query: "", sort: "newest" }))).toEqual([2, 3, 1]);
  });

  it("filters by status and sorts oldest first", () => {
    expect(ids(filterPulls(pulls, { status: "needs_review", query: "", sort: "oldest" }))).toEqual([1, 3]);
  });

  it("matches the query against title (case-insensitive) and number", () => {
    expect(ids(filterPulls(pulls, { status: "all", query: " CACHE ", sort: "newest" }))).toEqual([2]);
    expect(ids(filterPulls(pulls, { status: "all", query: "3", sort: "newest" }))).toEqual([3]);
  });

  it("does not mutate the input", () => {
    const copy = [...pulls];
    filterPulls(pulls, { status: "all", query: "", sort: "oldest" });
    expect(pulls).toEqual(copy);
  });
});

describe("countPulls", () => {
  it("counts open PRs and those needing review", () => {
    const pulls = [
      base({ status: "needs_review" }),
      base({ status: "reviewed" }),
      base({ status: "stale" }),
      base({ status: "merged" }),
    ];
    expect(countPulls(pulls)).toEqual({ open: 3, needsReview: 1 });
  });
});
