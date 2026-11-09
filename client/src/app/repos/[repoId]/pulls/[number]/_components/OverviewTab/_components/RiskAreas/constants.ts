import { Icon } from "@devdigest/ui";
import type { BriefRisk } from "@/lib/types";

export const RISK_KIND_ICON: Record<string, typeof Icon.Shield> = {
  security: Icon.Shield,
  db_migration: Icon.Database,
  breaking_api: Icon.GitBranch,
  perf: Icon.Gauge,
  deps: Icon.Boxes,
};
export const RISK_KIND_ICON_FALLBACK = Icon.AlertTriangle;

export const RISK_SEVERITY_COLOR: Record<BriefRisk["severity"], string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};
