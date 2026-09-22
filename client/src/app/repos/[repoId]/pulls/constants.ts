import type { PrMeta, Severity } from "../../../../lib/types";

/** Constants for the PR list page (/repos/:repoId/pulls). */

/**
 * Review status → colour token + i18n label key (under `list.status`). Open PRs
 * carry a derived review status (needs_review / reviewed / stale); merged/closed
 * keep their GitHub merge state.
 */
export const STATUS_META: Record<string, { c: string; labelKey: string }> = {
  needs_review: { c: "var(--warn)", labelKey: "needs_review" },
  reviewed: { c: "var(--ok)", labelKey: "reviewed" },
  stale: { c: "var(--stale)", labelKey: "stale" },
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

/**
 * Grid template for both the header row and PR rows — s.headRow and s.row()
 * share it, so a new column must be inserted at the SAME index in COLUMN_KEYS,
 * here, and in PRRow, or the header stops lining up with the cells.
 *
 * Every fixed column is taken out of the `1fr` title column: at a 1280px window
 * the title gets ~142px and ellipsises, at 1920px it gets ~780px and fits. That
 * truncation is an accepted trade-off for the FINDINGS column (116px) — budget
 * for it before adding a ninth.
 */
export const GRID = "1fr 132px 92px 60px 116px 118px 74px 78px";

/**
 * The three finding severities in display order, with the key they carry in
 * `PrMeta.findings_counts`. Typed with the CONTRACT's Severity (3 values) —
 * the UI kit's own `Severity` adds a phantom "INFO" that no finding ever has.
 */
export const SEVERITIES: {
  key: Severity;
  countKey: "critical" | "warning" | "suggestion";
}[] = [
  { key: "CRITICAL", countKey: "critical" },
  { key: "WARNING", countKey: "warning" },
  { key: "SUGGESTION", countKey: "suggestion" },
];

/** Hover-card timing: open on a deliberate hover, survive the gap on the way in. */
export const HOVER_OPEN_MS = 120;
export const HOVER_CLOSE_MS = 180;
export const CARD_WIDTH = 460;
export const CARD_MAX_HEIGHT = 340;

/** Line-count thresholds for the S/M/L size bucket. */
export const SIZE_SMALL_MAX = 100;
export const SIZE_MEDIUM_MAX = 400;

/** Filter chips: status key + i18n label key (under `list.filter`). */
export const STATUS_FILTERS: { key: string; labelKey: string }[] = [
  { key: "all", labelKey: "all" },
  { key: "needs_review", labelKey: "needs_review" },
  { key: "reviewed", labelKey: "reviewed" },
  { key: "stale", labelKey: "stale" },
];

/** Column header i18n keys (under `list.columns`), in display order. */
export const COLUMN_KEYS: string[] = [
  "pullRequest",
  "author",
  "size",
  "score",
  "findings",
  "status",
  "cost",
  "updated",
];

/** Number of skeleton rows shown while loading. */
export const SKELETON_ROWS = 4;

export type PrSize = "S" | "M" | "L";
export type SizeInfo = { size: PrSize; lines: number };

/** Re-exported for helpers that consume PrMeta. */
export type { PrMeta };
