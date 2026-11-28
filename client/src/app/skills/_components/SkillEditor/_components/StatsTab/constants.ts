/** Donut colour per finding category (theme tokens; resolved via style.fill). */
export const CATEGORY_COLORS: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "var(--sugg)",
  style: "var(--info)",
  test: "var(--ok)",
};
export const FALLBACK_CATEGORY_COLOR = "var(--text-muted)";
