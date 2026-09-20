/** Worst → best verdict rank, for picking the PR-level "lowest" outcome across runs. */
export const VERDICT_RANK: Record<string, number> = { request_changes: 0, comment: 1, approve: 2 };

/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
 * with zeroed size/diff. Backfill them once from the detail endpoint so the
 * list shows real S/M/L + ± counts. Capped per request (each backfill is a
 * detail fetch) — the periodic refetch chips away at any remainder.
 */
export const BACKFILL_LIMIT = 10;
