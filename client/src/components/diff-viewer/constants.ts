/** Constants for the DiffViewer. */
import type { Severity } from "@/lib/types";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** shell.json `diffViewer.*` message key per severity for a finding's line
 *  label (server/specs/06-smart-diff.md: CRITICAL -> blocker, WARNING ->
 *  warning, SUGGESTION -> suggestion). The component owns this copy under its
 *  existing `diffViewer` namespace (shell.json), not the route-owned
 *  prReview.json (arch review, LOW #1). */
export const SEVERITY_LABEL_KEY: Record<Severity, string> = {
  CRITICAL: "diffViewer.severity.critical",
  WARNING: "diffViewer.severity.warning",
  SUGGESTION: "diffViewer.severity.suggestion",
};
