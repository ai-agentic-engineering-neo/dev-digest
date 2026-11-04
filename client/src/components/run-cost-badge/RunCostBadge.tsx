/* RunCostBadge — what an agent run (or a whole PR) cost.
   compact  → "$0.014"                (PR list COST column)
   detailed → "9,119 tok · $0.0013"   (PR timeline run row)
   Presentational and i18n-free (it is mounted in /showcase, which has no
   intl provider): the caller passes the translated token unit. */
"use client";

import React from "react";
import { formatCost, formatTokenTotal } from "./helpers";
import { s } from "./styles";

export type RunCostBadgeProps = {
  variant: "compact" | "detailed";
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** Translated unit after the token total in the detailed variant, e.g. "tok". */
  tokenUnit?: string;
};

export function RunCostBadge({ variant, costUsd, tokensIn, tokensOut, tokenUnit = "tok" }: RunCostBadgeProps) {
  const cost = formatCost(costUsd);
  const tokens = variant === "detailed" ? formatTokenTotal(tokensIn, tokensOut) : null;
  const title =
    tokensIn != null || tokensOut != null
      ? `${(tokensIn ?? 0).toLocaleString("en-US")} → ${(tokensOut ?? 0).toLocaleString("en-US")} ${tokenUnit}`
      : undefined;
  return (
    <span className="mono" style={s.badge} title={title} data-testid="run-cost-badge">
      {tokens != null ? `${tokens} ${tokenUnit} · ${cost}` : cost}
    </span>
  );
}
