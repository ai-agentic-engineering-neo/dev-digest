/** Accept-rate colour bands (fraction 0–1): ≥ GOOD → ok, ≥ FAIR → warn, else crit. */
export const ACCEPT_GOOD_MIN = 0.6;
export const ACCEPT_FAIR_MIN = 0.4;

/** CSS colour per accept tone (theme tokens only). */
export const ACCEPT_TONE_COLOR = {
  good: "var(--ok)",
  fair: "var(--warn)",
  poor: "var(--crit)",
  none: "var(--text-muted)",
} as const;

export type AcceptTone = keyof typeof ACCEPT_TONE_COLOR;

/** Placeholders while stats load: agent rows and metric tiles. */
export const SKELETON_ROWS = [0, 1, 2] as const;
export const SKELETON_METRICS = [0, 1, 2, 3] as const;

