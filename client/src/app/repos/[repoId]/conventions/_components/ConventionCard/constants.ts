/** Confidence at or above this is shown green. */
export const HIGH_CONFIDENCE = 0.8;
/** Confidence at or above this (and below HIGH) is shown amber; lower is blue. */
export const MEDIUM_CONFIDENCE = 0.6;

export const CONFIDENCE_COLOR = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--accent)",
} as const;

/** Rows of the inline rule editor. */
export const RULE_EDITOR_ROWS = 3;
