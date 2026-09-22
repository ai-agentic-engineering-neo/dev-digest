/** Constants local to the findings hover card. */

/** Sort weight per severity in the card (lower = listed first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** Keep the card this far from every viewport edge. */
export const VIEWPORT_MARGIN = 12;

/** Skeleton rows shown while the PR's findings are being fetched. */
export const SKELETON_ROWS = 3;

export { CARD_MAX_HEIGHT, CARD_WIDTH, HOVER_CLOSE_MS, HOVER_OPEN_MS } from "../../constants";
