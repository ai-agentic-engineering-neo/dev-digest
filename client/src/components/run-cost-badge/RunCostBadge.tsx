/* RunCostBadge — displays a completed run's LLM cost (+ tokens). Used in two
   places: the PR list's COST column (compact) and the PR-detail verdict
   panel line (full). Both read the SAME run's data — see specs/run-cost.md. */
"use client";

import React from "react";
import { formatCostUsd, formatTokenPair } from "./helpers";

type RunCostBadgeProps =
  | { variant: "compact"; costUsd: number | null | undefined }
  | {
      variant: "full";
      costUsd: number | null | undefined;
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
    };

const style: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

export function RunCostBadge(props: RunCostBadgeProps) {
  if (props.variant === "compact") {
    return <span style={style}>{formatCostUsd(props.costUsd)}</span>;
  }
  const cost = formatCostUsd(props.costUsd);
  // A run with no cost data has nothing meaningful to show for tokens either
  // (never reviewed / failed / cancelled) — keep the whole badge to one dash.
  if (props.costUsd == null) {
    return <span style={style}>{cost}</span>;
  }
  return (
    <span style={style}>
      {cost} · {formatTokenPair(props.tokensIn, props.tokensOut)}
    </span>
  );
}

export default RunCostBadge;
