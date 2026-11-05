/**
 * Fixed category → categorical slot (color follows the entity, never its rank).
 * Slots are validated (dataviz validate_palette.js, dark + light) in this order.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  security: "var(--viz-1)",
  bug: "var(--viz-2)",
  perf: "var(--viz-3)",
  style: "var(--viz-4)",
  test: "var(--viz-5)",
};
/** Any category outside the known five. */
export const OTHER_CATEGORY_COLOR = "var(--viz-6)";
export const DONUT_SIZE = 150;
export const DONUT_STROKE = 24;
/** Degrees between donut segments (surface gap). */
export const DONUT_GAP = 2;
