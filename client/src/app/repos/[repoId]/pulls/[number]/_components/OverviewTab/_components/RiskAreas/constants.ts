import type { IconName, Severity } from "@devdigest/ui";
import type { RiskKind, RiskSeverity } from "@devdigest/shared";

/** Kind → icon. An unknown stored kind falls back to FALLBACK_ICON. */
export const KIND_ICON: Record<RiskKind, IconName> = {
  auth: "Lock",
  dependency: "Boxes",
  performance: "Gauge",
  data: "Database",
  api_change: "GitBranch",
  config: "Settings",
  other: "AlertTriangle",
};

export const FALLBACK_ICON: IconName = "AlertTriangle";

/** Risk severity → SEV token (D6). */
export const RISK_SEV: Record<RiskSeverity, Severity> = {
  high: "CRITICAL",
  medium: "WARNING",
  low: "SUGGESTION",
};
