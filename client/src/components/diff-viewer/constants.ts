/** Constants for the DiffViewer. */
import type { Severity } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Severity → `shell.diffViewer.findingLabel.*` i18n key (the line's label). */
export const FINDING_LABEL_KEY: Record<Severity, string> = {
  CRITICAL: "findingLabel.critical",
  WARNING: "findingLabel.warning",
  SUGGESTION: "findingLabel.suggestion",
};

/** Severity → `shell.diffViewer.findingDot.*` i18n key (the file dot's aria-label). */
export const FINDING_DOT_KEY: Record<Severity, string> = {
  CRITICAL: "findingDot.critical",
  WARNING: "findingDot.warning",
  SUGGESTION: "findingDot.suggestion",
};
