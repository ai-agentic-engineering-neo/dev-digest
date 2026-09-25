import type { PrMeta } from "@/lib/types";
import { DEFAULT_SORT, DEFAULT_STATUS, OPEN_STATUSES, SORT_ORDERS, type PullsSort } from "./constants";

type RawParam = string | string[] | undefined;

export interface PullsSearch {
  status: string;
  sort: PullsSort;
}

const first = (v: RawParam) => (Array.isArray(v) ? v[0] : v);

/** Normalize the route's ?status&sort into typed view state (unknown sort → newest). */
export function parsePullsSearch(raw: { status?: RawParam; sort?: RawParam }): PullsSearch {
  const status = first(raw.status) || DEFAULT_STATUS;
  const sort = first(raw.sort);
  return { status, sort: SORT_ORDERS.includes(sort as PullsSort) ? (sort as PullsSort) : DEFAULT_SORT };
}

/**
 * PR list URL for a filter state. `status` is always explicit so "all" sticks
 * over the needs_review default; the default sort is left out.
 */
export function pullsHref(repoId: string, { status, sort }: PullsSearch): string {
  const sp = new URLSearchParams({ status });
  if (sort !== DEFAULT_SORT) sp.set("sort", sort);
  return `/repos/${encodeURIComponent(repoId)}/pulls?${sp.toString()}`;
}

const updatedAt = (p: PrMeta) => Date.parse(p.updated_at ?? "") || 0;

/** PRs matching the status filter and the free-text query (title or #number), sorted by last update. */
export function filterPulls(pulls: readonly PrMeta[], { status, sort }: PullsSearch, query: string): PrMeta[] {
  const q = query.trim().toLowerCase();
  return pulls
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .sort((a, b) => (sort === "oldest" ? updatedAt(a) - updatedAt(b) : updatedAt(b) - updatedAt(a)));
}

/** Header counters: open PRs, those still waiting for review, and merged ones. */
export function countPulls(pulls: readonly PrMeta[]): { open: number; needsReview: number; merged: number } {
  let open = 0;
  let needsReview = 0;
  let merged = 0;
  for (const p of pulls) {
    if (OPEN_STATUSES.has(p.status)) open++;
    if (p.status === "needs_review") needsReview++;
    if (p.status === "merged") merged++;
  }
  return { open, needsReview, merged };
}

/** Filter-chip counters: every PR under "all", plus one entry per status. */
export function statusCounts(pulls: readonly PrMeta[]): Record<string, number> {
  const out: Record<string, number> = { all: pulls.length };
  for (const p of pulls) out[p.status] = (out[p.status] ?? 0) + 1;
  return out;
}
