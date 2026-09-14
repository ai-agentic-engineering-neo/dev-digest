/* RunCostBadge — cost + token usage of one review run (Run Cost Badge lab).
   Three kinds:
     compact  — "$0.012"                    (PR list COST column)
     detail   — "$0.014 · 8.2K→1.3K"       (verdict banner on PR detail)
     timeline — "9,119 tok · $0.0013"      (run row in the PR timeline)
   A run with no data renders "—", never "$0.00" — null cost means "unknown"
   (provider reported no usage/pricing), not "free". Pure display: all numbers
   come from the run row, zero extra model calls. */
"use client";

import React from "react";

/** "$0.0013" / "$0.014" (2 significant digits under $1), "$12.50" above. */
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
  variant?: "compact" | "detail" | "timeline";
}) {
  const cost = costUsd != null ? formatRunCost(costUsd) : null;
  const totalTokens = (tokensIn ?? 0) + (tokensOut ?? 0);
  const tokens =
    variant === "detail" && tokensIn != null && tokensOut != null
      ? `${formatTokens(tokensIn)}→${formatTokens(tokensOut)}`
      : variant === "timeline" && totalTokens > 0
        ? `${totalTokens.toLocaleString("en-US")} tok`
        : null;
  // Timeline reads tokens-first ("9,119 tok · $0.0013"); detail cost-first.
  const parts = (variant === "timeline" ? [tokens, cost] : [cost, tokens]).filter(
    (p): p is string => p != null,
  );
  return (
    <span
      className="mono"
      style={{ fontSize: 12, color: parts.length > 0 ? "var(--text-secondary)" : "var(--text-muted)" }}
    >
      {parts.length > 0 ? parts.join(" · ") : "—"}
    </span>
  );
}

export default RunCostBadge;
