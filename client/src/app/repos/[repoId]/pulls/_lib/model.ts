import type { PrMeta } from "@devdigest/shared";

/**
 * Business rules for the PR list (/repos/:repoId/pulls) — thresholds and
 * classifications that change when the product changes, not when the UI
 * does. No React import: shared by the route and (if needed) server code.
 */

/** Open PRs carry a derived review status; everything else is merged/closed. */
export const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);

/** Line-count thresholds for the S/M/L size bucket. */
export const SIZE_SMALL_MAX = 100;
export const SIZE_MEDIUM_MAX = 400;

export type PrSize = "S" | "M" | "L";
export type SizeInfo = { size: PrSize; lines: number };

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}
