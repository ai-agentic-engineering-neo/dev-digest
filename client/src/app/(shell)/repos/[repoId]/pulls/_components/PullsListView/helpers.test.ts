import { describe, it, expect } from "vitest";
import type { PrMeta } from "@/lib/types";
import { filterPulls, countOpen, countNeedsReview } from "./helpers";

const pr = (number: number, status: string, title: string, updated_at: string | null): PrMeta =>
  ({ number, status, title, updated_at }) as PrMeta;

const pulls = [
  pr(1, "needs_review", "Fix login", "2026-01-01T00:00:00Z"),
  pr(2, "reviewed", "Add cache", "2026-01-03T00:00:00Z"),
  pr(3, "merged", "Bump deps", "2026-01-02T00:00:00Z"),
  pr(4, "needs_review", "Refactor db", null),
];

describe("filterPulls", () => {
  it("filters by status, and 'all' keeps everything", () => {
    expect(filterPulls(pulls, { status: "needs_review", query: "", sort: "newest" }).map((p) => p.number)).toEqual([1, 4]);
    expect(filterPulls(pulls, { status: "all", query: "", sort: "newest" })).toHaveLength(4);
  });

  it("searches title case-insensitively and by number", () => {
    expect(filterPulls(pulls, { status: "all", query: " CACHE ", sort: "newest" }).map((p) => p.number)).toEqual([2]);
    expect(filterPulls(pulls, { status: "all", query: "3", sort: "newest" }).map((p) => p.number)).toEqual([3]);
  });

  it("sorts by updated_at, missing dates last when newest first, and does not mutate input", () => {
    const before = pulls.map((p) => p.number);
    expect(filterPulls(pulls, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2, 3, 1, 4]);
    expect(filterPulls(pulls, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([4, 1, 3, 2]);
    expect(pulls.map((p) => p.number)).toEqual(before);
  });
});

describe("counts", () => {
  it("counts open (needs_review/reviewed/stale) and needs_review", () => {
    expect(countOpen(pulls)).toBe(3);
    expect(countNeedsReview(pulls)).toBe(2);
  });
});
