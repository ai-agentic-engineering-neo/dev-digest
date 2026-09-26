import type { PrMeta } from "@/lib/types";
import { OPEN_STATUSES } from "./constants";

export interface PullsFilter {
  /** A status key, or "all". */
  status: string;
  /** Free-text search over title and number. */
  query: string;
  sort: string;
}

/** Status filter, then text search, then sort by `updated_at` (newest unless `sort === "oldest"`). */
export function filterPulls(pulls: PrMeta[], { status, query, sort }: PullsFilter): PrMeta[] {
  const q = query.trim().toLowerCase();
  return pulls
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });
}

export function countOpen(pulls: PrMeta[]): number {
  return pulls.filter((p) => OPEN_STATUSES.has(p.status)).length;
}

export function countNeedsReview(pulls: PrMeta[]): number {
  return pulls.filter((p) => p.status === "needs_review").length;
}
