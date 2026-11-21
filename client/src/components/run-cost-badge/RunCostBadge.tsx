/* RunCostBadge — USD cost of an agent run (M1). One component for every place
   the cost shows: PR list total, run timeline, trace stat, verdict banner.
   `compact` = cost only ("$0.014"); `detailed` = cost · tokens ("$0.014 · 8k→1.3k").
   Unknown cost renders "—", never "$0.00". Tooltip = exact value. */
"use client";

import React from "react";
import { formatTokens, formatUsd, formatUsdExact, NO_VALUE } from "@/lib/format";

export type RunCostBadgeProps = {
  costUsd: number | null | undefined;
  variant?: "compact" | "detailed";
  /** detailed only — shown after the cost when both are known. */
  tokensIn?: number | null;
  tokensOut?: number | null;
  style?: React.CSSProperties;
};

export function RunCostBadge({ costUsd, variant = "compact", tokensIn, tokensOut, style }: RunCostBadgeProps) {
  const known = costUsd != null;
  const tokens =
    variant === "detailed" && tokensIn != null && tokensOut != null ? formatTokens(tokensIn, tokensOut) : null;
  return (
    <span
      className="mono tnum"
      data-testid="run-cost"
      title={known ? formatUsdExact(costUsd) : undefined}
      style={{ color: known ? "inherit" : "var(--text-muted)", whiteSpace: "nowrap", ...style }}
    >
      {known ? formatUsd(costUsd) : NO_VALUE}
      {tokens && <span style={{ color: "var(--text-muted)" }}> · {tokens}</span>}
    </span>
  );
}
