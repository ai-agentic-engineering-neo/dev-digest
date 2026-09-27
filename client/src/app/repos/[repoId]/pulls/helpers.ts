import {
  OPEN_STATUSES,
  SIZE_MEDIUM_MAX,
  SIZE_SMALL_MAX,
  type PrMeta,
  type SizeInfo,
} from "./constants";

/** The list's three filter/sort inputs, all of which live in component or URL state. */
export interface PullListView {
  status: string;
  query: string;
  sort: string;
}

/** Apply the status chip, the text query and the updated-at sort, in that order. */
export function filterAndSortPulls(
  pulls: PrMeta[] | undefined,
  view: PullListView
): PrMeta[] {
  const q = view.query.trim().toLowerCase();
  return (pulls ?? [])
    .filter((p) => view.status === "all" || p.status === view.status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return view.sort === "oldest" ? ta - tb : tb - ta;
    });
}

/** Header counts: open PRs, and the subset of them still awaiting a review. */
export function pullCounts(pulls: PrMeta[] | undefined): {
  open: number;
  needsReview: number;
} {
  const rows = pulls ?? [];
  return {
    open: rows.filter((p) => OPEN_STATUSES.has(p.status)).length,
    needsReview: rows.filter((p) => p.status === "needs_review").length,
  };
}

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

/** Compact relative time for the list's UPDATED column (e.g. "3h", "2d"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
