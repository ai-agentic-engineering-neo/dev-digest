import type { Severity } from "@devdigest/shared";

export const SEV_DOT_COLOR: Readonly<Record<Severity, string>> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

/** Severity → `runs.severity.*` message key. */
export const SEVERITY_KEY: Readonly<Record<Severity, "critical" | "warning" | "suggestion">> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};
