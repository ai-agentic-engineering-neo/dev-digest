/** Donut colour per finding category (FindingCategory); unknown → muted. */
export const CATEGORY_COLOR: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#a855f7",
  style: "var(--sugg)",
  test: "var(--ok)",
};
export const FALLBACK_CATEGORY_COLOR = "var(--text-muted)";
