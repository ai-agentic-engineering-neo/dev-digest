import { describe, it, expect } from "vitest";
import type { PrMeta } from "@/lib/types";
import { countPulls, filterPulls, parsePullsSearch, pullsHref } from "./helpers";

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    number: 1,
    title: "PR",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "x",
    additions: 1,
    deletions: 1,
    files_count: 1,
    status: "needs_review",
    updated_at: "2026-06-01T00:00:00Z",
    score: null,
    ...o,
  };
}

const PULLS = [
  pr({ number: 10, title: "Add rate limiting", status: "needs_review", updated_at: "2026-06-02T00:00:00Z" }),
  pr({ number: 11, title: "Fix login", status: "reviewed", updated_at: "2026-06-03T00:00:00Z" }),
  pr({ number: 12, title: "Rate limit docs", status: "needs_review", updated_at: "2026-06-01T00:00:00Z" }),
  pr({ number: 13, title: "Old merge", status: "merged", updated_at: null }),
];

describe("parsePullsSearch", () => {
  it("defaults to needs_review + newest", () => {
    expect(parsePullsSearch({})).toEqual({ status: "needs_review", sort: "newest" });
  });

  it("keeps explicit values, takes the first of repeated params and rejects unknown sorts", () => {
    expect(parsePullsSearch({ status: ["all", "stale"], sort: "oldest" })).toEqual({ status: "all", sort: "oldest" });
    expect(parsePullsSearch({ status: "reviewed", sort: "random" })).toEqual({ status: "reviewed", sort: "newest" });
  });
});

describe("pullsHref", () => {
  it("always writes status and omits the default sort", () => {
    expect(pullsHref("r1", { status: "all", sort: "newest" })).toBe("/repos/r1/pulls?status=all");
    expect(pullsHref("r1", { status: "stale", sort: "oldest" })).toBe("/repos/r1/pulls?status=stale&sort=oldest");
  });
});

describe("filterPulls", () => {
  it("filters by status and sorts newest first", () => {
    expect(filterPulls(PULLS, { status: "needs_review", sort: "newest" }, "").map((p) => p.number)).toEqual([10, 12]);
  });

  it("'all' keeps every status; oldest puts missing dates first", () => {
    expect(filterPulls(PULLS, { status: "all", sort: "oldest" }, "").map((p) => p.number)).toEqual([13, 12, 10, 11]);
  });

  it("matches the query against title (case-insensitive) or number", () => {
    expect(filterPulls(PULLS, { status: "all", sort: "newest" }, "  RATE ").map((p) => p.number)).toEqual([10, 12]);
    expect(filterPulls(PULLS, { status: "all", sort: "newest" }, "11").map((p) => p.number)).toEqual([11]);
  });

  it("does not mutate the input", () => {
    const input = [...PULLS];
    filterPulls(input, { status: "all", sort: "oldest" }, "");
    expect(input).toEqual(PULLS);
  });
});

describe("countPulls", () => {
  it("counts open (derived review statuses) and needs-review PRs", () => {
    expect(countPulls(PULLS)).toEqual({ open: 3, needsReview: 2 });
  });
});
