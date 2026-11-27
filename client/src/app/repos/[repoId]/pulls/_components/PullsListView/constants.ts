/** Open PRs carry a derived review status; everything else is merged/closed. */
export const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);

/** Default status filter — the most actionable view on open. */
export const DEFAULT_STATUS_FILTER = "needs_review";
