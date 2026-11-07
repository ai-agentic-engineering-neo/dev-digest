import type { BlastDegradedReason } from "@/lib/types";

export const SKELETON_HEIGHT = 140;
/** Reasons where re-running the indexer can improve the map. */
export const RESYNC_REASONS: readonly BlastDegradedReason[] = ["index_partial", "index_failed"];
/** Degraded reasons where the caller map was still computed (so an empty list is meaningful). */
export const MAP_COMPUTED_REASONS: readonly BlastDegradedReason[] = ["index_partial", "flag_off", "repo_too_large"];
export const RESYNC_POLL_TIMEOUT_MS = 120_000;
