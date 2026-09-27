/** Severity → i18n key (under shell.diffViewer.findingTag). Colours come from
 *  SEV_COLOR in components/finding-card/constants.ts. */
export const TAG_KEY: Record<string, string> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
  INFO: "info",
};

/** Highest severity first. */
export const SEVERITY_RANK = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"] as const;
