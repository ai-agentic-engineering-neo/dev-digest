/** Donut segment color per finding category (existing severity/category CSS vars;
    `perf` has no dedicated var, so it uses the purple already used elsewhere in the app). */
export const CATEGORY_COLORS: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#8b5cf6",
  style: "var(--sugg)",
  test: "var(--ok)",
};

/** Fallback for categories the UI doesn't know about. */
export const FALLBACK_CATEGORY_COLOR = "var(--text-muted)";

/** Accept-rate ring diameter / stroke (px). */
export const RING_SIZE = 34;
export const RING_STROKE = 3;

/** Donut diameter / ring thickness (px) for the findings-by-category panel. */
export const DONUT_SIZE = 150;
export const DONUT_STROKE = 24;
