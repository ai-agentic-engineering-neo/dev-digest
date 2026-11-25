import { describe, it, expect } from "vitest";
import type { PrMeta } from "@/lib/types";
import { pullCounts, visiblePulls } from "./helpers";

type Pr = Pick<PrMeta, "status" | "title" | "number" | "updated_at">;
const pr = (number: number, status: PrMeta["status"], updated_at: string | null, title = `PR ${number}`): Pr => ({
  number,
  status,
  updated_at,
  title,
});

const PULLS: Pr[] = [
  pr(1, "needs_review", "2026-11-20T10:00:00Z", "Fix login bug"),
  pr(2, "reviewed", "2026-11-22T10:00:00Z", "Add cache"),
  pr(3, "merged", "2026-11-21T10:00:00Z", "Bump deps"),
  pr(14, "needs_review", null, "Refactor LOGIN form"),
  pr(5, "closed", "not-a-date", "Drop feature"),
];

const ids = (list: Pr[]) => list.map((p) => p.number);

describe("visiblePulls", () => {
  it("keeps every PR for status 'all', newest first", () => {
    expect(ids(visiblePulls(PULLS, { status: "all", query: "", sort: "newest" }))).toEqual([2, 3, 1, 14, 5]);
  });

  it("filters by an exact status", () => {
    expect(ids(visiblePulls(PULLS, { status: "needs_review", query: "", sort: "newest" }))).toEqual([1, 14]);
    expect(visiblePulls(PULLS, { status: "stale", query: "", sort: "newest" })).toEqual([]);
  });

  it("searches the title case-insensitively and trims the query", () => {
    expect(ids(visiblePulls(PULLS, { status: "all", query: "  login ", sort: "newest" }))).toEqual([1, 14]);
  });

  it("matches the query against the PR number as a substring", () => {
    expect(ids(visiblePulls(PULLS, { status: "all", query: "1", sort: "newest" }))).toEqual([1, 14]);
  });

  it("sorts oldest first, missing or invalid dates as the epoch", () => {
    expect(ids(visiblePulls(PULLS, { status: "all", query: "", sort: "oldest" }))).toEqual([14, 5, 1, 3, 2]);
  });

  it("does not mutate the input", () => {
    const before = ids(PULLS);
    visiblePulls(PULLS, { status: "all", query: "", sort: "oldest" });
    expect(ids(PULLS)).toEqual(before);
  });
});

describe("pullCounts", () => {
  it("counts open review statuses and those needing review", () => {
    expect(pullCounts([...PULLS, pr(6, "stale", null)])).toEqual({ open: 4, needsReview: 2 });
  });

  it("is zero for no PRs", () => {
    expect(pullCounts([])).toEqual({ open: 0, needsReview: 0 });
  });
});
