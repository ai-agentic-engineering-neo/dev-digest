import { describe, it, expect } from "vitest";
import type { PrMeta } from "@devdigest/shared";
import { countPulls, filterPulls } from "./helpers";

function pr(number: number, status: string, updated: string | null, title = `PR ${number}`): PrMeta {
  return {
    number,
    title,
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "s",
    additions: 0,
    deletions: 0,
    files_count: 0,
    status,
    opened_at: null,
    updated_at: updated,
  } as PrMeta;
}

const LIST = [
  pr(1, "needs_review", "2026-01-01T00:00:00Z", "Add rate limiting"),
  pr(2, "reviewed", "2026-03-01T00:00:00Z"),
  pr(3, "merged", "2026-02-01T00:00:00Z"),
  pr(4, "needs_review", null),
];

describe("filterPulls", () => {
  it("filters by status, 'all' keeps everything", () => {
    expect(filterPulls(LIST, { status: "needs_review", query: "", sort: "newest" }).map((p) => p.number)).toEqual([1, 4]);
    expect(filterPulls(LIST, { status: "all", query: "", sort: "newest" })).toHaveLength(4);
  });

  it("searches title (case-insensitive) and number", () => {
    expect(filterPulls(LIST, { status: "all", query: " RATE ", sort: "newest" }).map((p) => p.number)).toEqual([1]);
    expect(filterPulls(LIST, { status: "all", query: "3", sort: "newest" }).map((p) => p.number)).toEqual([3]);
  });

  it("sorts by updated_at, missing dates last for newest / first for oldest", () => {
    expect(filterPulls(LIST, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2, 3, 1, 4]);
    expect(filterPulls(LIST, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([4, 1, 3, 2]);
  });

  it("does not mutate the input", () => {
    const copy = [...LIST];
    filterPulls(LIST, { status: "all", query: "", sort: "oldest" });
    expect(LIST).toEqual(copy);
  });
});

describe("countPulls", () => {
  it("counts open (derived review statuses) and needs-review", () => {
    expect(countPulls(LIST)).toEqual({ open: 3, needsReview: 2 });
  });
});
