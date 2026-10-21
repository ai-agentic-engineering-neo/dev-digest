/* RunCostBadge — cost (and tokens) of one review run, or a PR's total (L01).
   Two variants:
     compact → "$0.012"                 (PR list COST column)
     full    → "9,119 tok · $0.0013"    (timeline row, review-run header)
   No data (cost null) → "—" in both variants; tokens alone never render.
   Purely presentational: no hooks, no fetch. Spec: client/specs/run-cost-badge.md */
"use client";

import React from "react";
import { formatCost, formatTokenTotal, totalTokens } from "@/lib/format-cost";
import { s } from "./styles";

export type RunCostBadgeProps = {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant: "compact" | "full";
  /** Tooltip (e.g. "3 runs" on the PR list). */
  title?: string;
};

export function RunCostBadge({ costUsd, tokensIn, tokensOut, variant, title }: RunCostBadgeProps) {
  if (costUsd == null || !Number.isFinite(costUsd)) {
    return (
      <span style={s.empty} title={title} data-testid="run-cost-badge" data-variant={variant}>
        —
      </span>
    );
  }
  const cost = formatCost(costUsd);
  if (variant === "compact") {
    return (
      <span className="tnum" style={s.compact} title={title} data-testid="run-cost-badge" data-variant="compact">
        {cost}
      </span>
    );
  }
  const tokens = totalTokens(tokensIn, tokensOut);
  return (
    <span className="mono tnum" style={s.full} title={title} data-testid="run-cost-badge" data-variant="full">
      {tokens != null ? `${formatTokenTotal(tokens)} tok · ${cost}` : cost}
    </span>
  );
}
