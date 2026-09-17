/* RunCostBadge — a USD cost, optionally with token usage.
   Two kinds:
     compact  — "$0.014"              (COST column in the PR list: the TOTAL of
                                       the PR's completed runs, not the latest)
     timeline — "9,119 tok · $0.0013" (one run row in the PR detail timeline)
   A run with no data renders "—", never "$0.00": a null cost means the provider
   reported no usage/pricing, not that the run was free. Pure display — every
   number comes off the run row, so this costs zero extra model calls. */
"use client";

import React from "react";

/** "$0.0013" / "$0.014" (2 significant digits under $1), "$12.50" at $1 and above. */
export function formatRunCost(costUsd: number): string {
  if (costUsd >= 1) return `$${costUsd.toFixed(2)}`;
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.0001) return "<$0.0001";
  return `$${Number(costUsd.toPrecision(2))}`;
}

/** 15230 → "15.2K", 820 → "820". */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  const k = (count / 1000).toFixed(1);
  return `${k.endsWith(".0") ? k.slice(0, -2) : k}K`;
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
  // Only the timeline shows tokens; the PR-list column stays a single number.
  const tokens =
    variant === "timeline" && totalTokens > 0
      ? `${totalTokens.toLocaleString("en-US")} tok`
      : null;
  const parts = [tokens, cost].filter((p): p is string => p != null);
  return (
    <span
      className="mono"
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
