/* RunCostBadge — LLM spend of one agent run (M1 cost badge).
   compact: "$0.014"             — PR list COST column
   full:    "$0.014 · 8.2K→1.3K" — verdict banner on PR detail
   Unknown cost (legacy / failed / unpriced run) renders "—", never "$0.00". */
"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import { formatCostUsd, formatTokensArrow } from "@/lib/format-cost";

export type RunCostBadgeProps = {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "full";
};

export function RunCostBadge({ costUsd, tokensIn, tokensOut, variant = "compact" }: RunCostBadgeProps) {
  const cost = formatCostUsd(costUsd);
  if (variant === "compact") {
    return (
      <span className="mono tnum" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
        {cost}
      </span>
    );
  }
  const tokens = formatTokensArrow(tokensIn, tokensOut);
  return (
    <Badge mono color="var(--text-secondary)">
      {tokens === "—" ? cost : `${cost} · ${tokens}`}
    </Badge>
  );
}
