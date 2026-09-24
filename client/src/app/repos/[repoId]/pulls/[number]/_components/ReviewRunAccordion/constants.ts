export const VERDICT_COLOR: Record<string, string> = {
  request_changes: "var(--crit)",
  comment: "var(--warn)",
  approve: "var(--ok)",
};
export const VERDICT_COLOR_FALLBACK = "var(--text-muted)";

/** Verdicts with a label under prReview `accordion.verdict.*`. */
export const KNOWN_VERDICTS = ["request_changes", "comment", "approve"] as const;
