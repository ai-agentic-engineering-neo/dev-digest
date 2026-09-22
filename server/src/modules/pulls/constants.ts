/** Max PR detail fetches per GET /repos/:id/pulls (the periodic refetch does the rest). */
export const BACKFILL_LIMIT = 10;
/** Parallel GitHub detail fetches during the diff-stat backfill. */
export const BACKFILL_CONCURRENCY = 4;
