import type { PrMeta } from "../../../../lib/types";

/** Constants for the PR list page (/repos/:repoId/pulls). */

/** GitHub merge state → colour token + i18n label key (under `list.status`). */
export const STATUS_META: Record<string, { c: string; labelKey: string }> = {
  open: { c: "var(--warn)", labelKey: "open" },
  merged: { c: "var(--ok)", labelKey: "merged" },
  closed: { c: "var(--stale)", labelKey: "closed" },
};

/** Size bucket → colour token. */
export const SIZE_COLOR: Record<string, string> = {
  S: "var(--ok)",
  M: "var(--warn)",
  L: "var(--crit)",
};

/** Grid template for both the header row and PR rows. */
export const GRID = "1fr 130px 92px 64px 110px 72px";

/** Line-count thresholds for the S/M/L size bucket. */
export const SIZE_SMALL_MAX = 100;
export const SIZE_MEDIUM_MAX = 400;

/** Filter chips: status key + i18n label key (under `list.filter`). */
export const STATUS_FILTERS: { key: string; labelKey: string }[] = [
  { key: "all", labelKey: "all" },
  { key: "open", labelKey: "open" },
  { key: "merged", labelKey: "merged" },
  { key: "closed", labelKey: "closed" },
];

/** Column header i18n keys (under `list.columns`), in display order. */
export const COLUMN_KEYS: string[] = [
  "pullRequest",
  "author",
  "size",
  "diff",
  "status",
  "files",
];

/** Number of skeleton rows shown while loading. */
export const SKELETON_ROWS = 4;

export type PrSize = "S" | "M" | "L";
export type SizeInfo = { size: PrSize; lines: number };

/** Re-exported for helpers that consume PrMeta. */
export type { PrMeta };
