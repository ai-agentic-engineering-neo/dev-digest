/** Constants for the DiffViewer. */
import type { Severity } from "@devdigest/ui";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Local mirror of severity ordering (higher = more severe); no runtime import from @devdigest/shared. */
export const SEVERITY_RANK = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
  INFO: 0,
} as const satisfies Record<Severity, number>;
