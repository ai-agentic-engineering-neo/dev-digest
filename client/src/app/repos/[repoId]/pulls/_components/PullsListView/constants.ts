/** Constants for the PR list view. */

/** Open PRs carry a derived review status; everything else is merged/closed. */
export const OPEN_STATUSES: ReadonlySet<string> = new Set(["needs_review", "reviewed", "stale"]);
