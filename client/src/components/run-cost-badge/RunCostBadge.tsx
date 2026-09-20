/* RunCostBadge — what one review run cost, in USD.
   Two kinds:
     compact  — "$0.014"                 (COST column in the PR list)
     timeline — "9,119 tok · $0.0013"    (run row in the PR timeline)
   A run with no cost renders "—", never "$0.00": null means "unknown" (the
   provider reported no usage, or the model has no price), not "free". Pure
   display — every number comes from the run row, zero extra model calls. */
"use client";

import React from "react";

/** "$0.0013" / "$0.014" (2 significant digits under $1), "$12.50" above. */
export function formatRunCost(costUsd: number): string {
  if (costUsd >= 1) return `$${costUsd.toFixed(2)}`;
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.0001) return "<$0.0001";
  return `$${Number(costUsd.toPrecision(2))}`;
}

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "timeline";
}) {
  const cost = costUsd != null ? formatRunCost(costUsd) : null;
  const totalTokens = (tokensIn ?? 0) + (tokensOut ?? 0);
  const tokens =
    variant === "timeline" && totalTokens > 0 ? `${totalTokens.toLocaleString("en-US")} tok` : null;
  // Timeline reads tokens-first ("9,119 tok · $0.0013"); compact is cost only.
  const parts = [tokens, cost].filter((p): p is string => p != null);
  return (
    <span
      className="mono tnum"
      style={{
        fontSize: 12,
        color: parts.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
      }}
    >
      {parts.length > 0 ? parts.join(" · ") : "—"}
    </span>
  );
}

export default RunCostBadge;
