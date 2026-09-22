/** Open PRs carry a derived review status; everything else is merged/closed. */
export const OPEN_STATUSES: ReadonlySet<string> = new Set(["needs_review", "reviewed", "stale"]);

/** Status filter applied when ?status= is absent — the most actionable one. */
export const DEFAULT_STATUS = "needs_review";

/** Sort orders for the list, by last update. */
export const SORT_ORDERS = ["newest", "oldest"] as const;
export type PullsSort = (typeof SORT_ORDERS)[number];

/** Sort applied when ?sort= is absent or unknown (kept out of the URL). */
export const DEFAULT_SORT: PullsSort = "newest";
