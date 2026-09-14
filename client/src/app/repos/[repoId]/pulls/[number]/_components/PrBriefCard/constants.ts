import type { IconName } from "@devdigest/ui";
import type { BriefStatus, RiskKind, RiskSeverity } from "@devdigest/shared";

/**
 * AC-37/clarification 6 — the closed `RiskKind` vocabulary's icon+colour
 * mapping. TOTAL over every value in the enum plus `other`, so an unmapped
 * kind is a type error here, not a silent fallback at render time.
 */
export const RISK_KIND_META: Record<RiskKind, { icon: IconName; color: string }> = {
  auth_surface: { icon: "Lock", color: "var(--crit)" },
  dependency: { icon: "Boxes", color: "var(--info)" },
  performance: { icon: "Gauge", color: "var(--warn)" },
  data_migration: { icon: "Database", color: "var(--warn)" },
  api_contract: { icon: "Workflow", color: "var(--info)" },
  config_secrets: { icon: "Shield", color: "var(--crit)" },
  test_coverage: { icon: "FlaskConical", color: "var(--text-secondary)" },
  other: { icon: "Info", color: "var(--text-muted)" },
};

/** Non-functional accessibility — the risk level is ALSO rendered as text
 *  (HIGH/MEDIUM/LOW) plus an icon; this colour is never the only signal. */
export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-secondary)",
};

export const SEVERITY_ICON: Record<RiskSeverity, IconName> = {
  high: "AlertOctagon",
  medium: "AlertTriangle",
  low: "Info",
};

/** AC-41's seven distinct states — one entry each, so a new `BriefStatus`
 *  value is a type error here rather than silently unrendered. */
export const STATUS_META: Record<BriefStatus, { icon: IconName; color: string; bg: string }> = {
  none: { icon: "Info", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  generating: { icon: "RefreshCw", color: "var(--info)", bg: "var(--info-bg)" },
  generated: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  earlier_state: { icon: "Clock", color: "var(--warn)", bg: "var(--warn-bg)" },
  possibly_stale: { icon: "Clock", color: "var(--warn)", bg: "var(--warn-bg)" },
  refused: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
  failed: { icon: "AlertOctagon", color: "var(--crit)", bg: "var(--crit-bg)" },
};
