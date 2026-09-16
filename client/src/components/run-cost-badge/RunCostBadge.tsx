/* RunCostBadge — displays a run's USD cost as small muted mono text. Used in
   the PR-list COST column and the Agent-runs timeline row. The drawer's Stats
   tile calls formatCost() directly instead (existing Stat atom, no component
   needed there). */
"use client";

import React from "react";
import { formatCost } from "@/lib/cost";

export function RunCostBadge({ costUsd }: { costUsd: number | null | undefined }) {
  return (
    <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
      {formatCost(costUsd)}
    </span>
  );
}
