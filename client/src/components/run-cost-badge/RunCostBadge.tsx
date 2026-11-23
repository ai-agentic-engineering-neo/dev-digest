/* RunCostBadge — muted mono cost of a run / PR (spec: docs/features/run-cost/spec.md).
 *   variant="compact" → "$0.014"              (PR list COST column)
 *   variant="inline"  → "9,119 tok · $0.0013" (agent-run timeline row)
 * Presentational: the caller passes the already-translated tokens label so the
 * component stays free of an i18n namespace. */
import React from "react";
import { formatCost } from "@/lib/format-cost";

export interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  variant?: "compact" | "inline";
  /** Inline variant only: translated token count, e.g. "9,119 tok". Omitted → cost alone. */
  tokensLabel?: string;
}

const base: React.CSSProperties = { color: "var(--text-muted)", whiteSpace: "nowrap" };

export function RunCostBadge({ costUsd, variant = "compact", tokensLabel }: RunCostBadgeProps) {
  const cost = formatCost(costUsd);
  const text = variant === "inline" && tokensLabel ? `${tokensLabel} · ${cost}` : cost;
  return (
    <span className="mono tnum" style={variant === "compact" ? { ...base, fontSize: 12 } : base}>
      {text}
    </span>
  );
}

export default RunCostBadge;
