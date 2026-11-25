/** Pure list rules for the PR list view: filter, search, sort and counts. */
import type { PrMeta } from "@/lib/types";
import { OPEN_STATUSES } from "./constants";

type ListedPr = Pick<PrMeta, "status" | "title" | "number" | "updated_at">;

export interface PullsView {
  /** A status key, or "all" for no status filter. */
  status: string;
  /** Free-text search over the title (case-insensitive) and the PR number. */
  query: string;
  /** "oldest" sorts by updated_at ascending; anything else is newest first. */
  sort: string;
}

/** PRs to render for the active status chip, search box and sort order.
 *  A missing or unparsable updated_at sorts as the epoch. Never mutates the input. */
export function visiblePulls<T extends ListedPr>(
  pulls: readonly T[],
  { status, query, sort }: PullsView,
): T[] {
  const q = query.trim().toLowerCase();
  return pulls
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });
}

/** Header counters: open PRs (any open review status) and those needing review. */
export function pullCounts(pulls: readonly Pick<PrMeta, "status">[]): {
  open: number;
  needsReview: number;
} {
  return {
    open: pulls.filter((p) => OPEN_STATUSES.has(p.status)).length,
    needsReview: pulls.filter((p) => p.status === "needs_review").length,
  };
}
