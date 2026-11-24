/* RunCostBadge — a run's cost, two views:
   compact  → "$0.014"              (PR list COST column, run timeline row)
   detailed → "$0.014 · 8.2K→1.3K"  (verdict banner)
   No cost → "—" (never "$0.00"). Tokens are shown in `detailed` only when known. */
import React from "react";
import { formatCost, formatTokensInOut } from "@/lib/format-cost";

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
}) {
  const showTokens = variant === "detailed" && tokensIn != null && tokensOut != null;
  return (
    <span className="mono tnum" data-testid="run-cost" style={{ whiteSpace: "nowrap" }}>
      {formatCost(costUsd)}
      {showTokens ? ` · ${formatTokensInOut(tokensIn, tokensOut)}` : ""}
    </span>
  );
}
