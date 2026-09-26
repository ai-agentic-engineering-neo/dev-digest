/** Open PRs carry a derived review status; everything else is merged/closed. */
export const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);
