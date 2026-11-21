/** Max height (px) of a long PR description before it collapses behind a fade. */
export const DESCRIPTION_COLLAPSED_HEIGHT = 420;

/** Risk level → accent colour on the "at a glance" card (matches the brief's own palette). */
export const RISK_TONE: Record<"high" | "medium" | "low", string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--ok)",
};
