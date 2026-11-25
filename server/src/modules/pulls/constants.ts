/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly imported PRs land
 * with zeroed size. Each list request backfills at most this many from the
 * detail endpoint; the rest wait for a later request.
 */
export const DIFF_STAT_BACKFILL_LIMIT = 10;
