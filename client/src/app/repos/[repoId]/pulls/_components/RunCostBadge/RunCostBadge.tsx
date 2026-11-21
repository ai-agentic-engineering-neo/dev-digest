/* RunCostBadge — cost (and tokens) of one agent run (M1).
   - compact:  "$0.012"              (PR list COST column, review-run header)
   - detailed: "$0.014 · 8.2K→1.3K"  (Agent runs timeline)
   Callers pass null for runs that are not done, so a running / failed /
   cancelled run renders "—" instead of a fake or partial price. */
"use client";

import React from "react";
import { NO_COST, formatCost, formatTokenPair } from "./helpers";

export interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  variant?: "compact" | "detailed";
  tokensIn?: number | null;
  tokensOut?: number | null;
  style?: React.CSSProperties;
}

export function RunCostBadge({ costUsd, variant = "compact", tokensIn, tokensOut, style }: RunCostBadgeProps) {
  const hasCost = costUsd != null && Number.isFinite(costUsd);
  const parts: string[] = [];
  if (hasCost) parts.push(formatCost(costUsd));
  if (variant === "detailed" && tokensIn != null && tokensOut != null) {
    parts.push(formatTokenPair(tokensIn, tokensOut));
  }
  const empty = parts.length === 0;
  return (
    <span
      className="mono tnum"
      data-testid="run-cost-badge"
      // Unrounded value on hover, for checking against the run log / OpenRouter.
      title={hasCost ? `$${costUsd}` : undefined}
      style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", ...style }}
    >
      {empty ? NO_COST : parts.join(" · ")}
    </span>
  );
}

export default RunCostBadge;
