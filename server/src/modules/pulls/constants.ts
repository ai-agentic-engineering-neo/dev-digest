/**
 * How many zero-stat PRs one list request may backfill from the detail endpoint.
 * Each backfill is a full detail fetch, so the cap bounds the request; the
 * periodic refetch chips away at any remainder.
 */
export const BACKFILL_LIMIT = 10;
