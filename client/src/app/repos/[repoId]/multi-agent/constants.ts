import type { Severity } from "@devdigest/shared";

/** POST /pulls/:id/review rateLimit 10/min (server/src/modules/reviews/routes.ts:29). */
export const MAX_AGENTS_PER_RUN = 10;
export const MAX_GRID_COLUMNS = 5;
export const COLUMN_MIN_WIDTH_PX = 220;
/** Agent colors are --viz-1..6. */
export const AGENT_COLOR_COUNT = 6;
/** Tab score tone: >= SCORE_OK ok, >= SCORE_WARN warn, else crit. SCORE_OK matches the kit CircularScore ok threshold (vendor/ui/primitives/CircularScore.tsx). */
export const SCORE_OK = 75;
export const SCORE_WARN = 50;

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};
