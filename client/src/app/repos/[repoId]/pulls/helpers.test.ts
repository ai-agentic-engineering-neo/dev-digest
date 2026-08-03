/* Tests for the PR list's filter/sort/count rules.
   These were inline in page.tsx until the PullsListView extraction — reaching
   them meant rendering the whole route with a router harness. As pure functions
   they need neither. */
import { describe, it, expect } from "vitest";
import type { PrMeta } from "@/lib/types";
import { visiblePulls, pullCounts } from "./helpers";

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 1,
    title: "Some change",
    author: "someone",
    branch: "feat/x",
    base: "main",
    head_sha: "abc1234",
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: "needs_review",
    opened_at: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    score: null,
    ...o,
  } as PrMeta;
}

describe("visiblePulls", () => {
  it("'all' keeps every status; a specific status filters to it", () => {
    const list = [pr({ number: 1, status: "needs_review" }), pr({ number: 2, status: "merged" })];

    expect(visiblePulls(list, { status: "all", query: "", sort: "newest" })).toHaveLength(2);
    expect(
      visiblePulls(list, { status: "merged", query: "", sort: "newest" }).map((p) => p.number),
    ).toEqual([2]);
  });

  it("matches the query against both title and PR number", () => {
    const list = [
      pr({ number: 10, title: "Add rate limiting" }),
      pr({ number: 22, title: "Fix login redirect" }),
    ];
    const opts = { status: "all", sort: "newest" as const };

    expect(visiblePulls(list, { ...opts, query: "rate" }).map((p) => p.number)).toEqual([10]);
    expect(visiblePulls(list, { ...opts, query: "22" }).map((p) => p.number)).toEqual([22]);
    // Case-insensitive, and whitespace-only is treated as no query.
    expect(visiblePulls(list, { ...opts, query: "LOGIN" }).map((p) => p.number)).toEqual([22]);
    expect(visiblePulls(list, { ...opts, query: "   " })).toHaveLength(2);
  });

  it("sorts newest-first by default and oldest-first on request", () => {
    const list = [
      pr({ number: 1, updated_at: "2026-01-01T00:00:00.000Z" }),
      pr({ number: 2, updated_at: "2026-06-01T00:00:00.000Z" }),
    ];
    const opts = { status: "all", query: "" };

    expect(visiblePulls(list, { ...opts, sort: "newest" }).map((p) => p.number)).toEqual([2, 1]);
    expect(visiblePulls(list, { ...opts, sort: "oldest" }).map((p) => p.number)).toEqual([1, 2]);
  });

  it("treats a null/unparseable updated_at as epoch rather than throwing", () => {
    const list = [
      pr({ number: 1, updated_at: null }),
      pr({ number: 2, updated_at: "not-a-date" }),
      pr({ number: 3, updated_at: "2026-01-01T00:00:00.000Z" }),
    ];

    const ordered = visiblePulls(list, { status: "all", query: "", sort: "newest" });
    expect(ordered[0]!.number).toBe(3);
    expect(ordered).toHaveLength(3);
  });

  it("does not mutate the input array", () => {
    const list = [
      pr({ number: 1, updated_at: "2026-01-01T00:00:00.000Z" }),
      pr({ number: 2, updated_at: "2026-06-01T00:00:00.000Z" }),
    ];
    const before = list.map((p) => p.number);

    visiblePulls(list, { status: "all", query: "", sort: "newest" });

    expect(list.map((p) => p.number)).toEqual(before);
  });
});

describe("pullCounts", () => {
  it("counts open as the three review statuses, and needs_review separately", () => {
    const list = [
      pr({ status: "needs_review" }),
      pr({ status: "reviewed" }),
      pr({ status: "stale" }),
      pr({ status: "merged" }),
      pr({ status: "closed" }),
    ];

    expect(pullCounts(list)).toEqual({ open: 3, needsReview: 1 });
  });

  it("returns zeroes for an empty list", () => {
    expect(pullCounts([])).toEqual({ open: 0, needsReview: 0 });
  });
});
