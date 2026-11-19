/* RunCostBadge — cost (+ tokens) of one agent run, in three compact shapes.
   cost      → "$0.014"                  PR list COST cell
   timeline  → "9,119 tok · $0.0013"     timeline run row
   inout     → "$0.014 · 8.2k→1.3k"      verdict banner
   No data renders "—", never "$0.00" (see formatCost). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { formatCost, formatTokens } from "../../helpers";

export type RunCostBadgeVariant = "cost" | "timeline" | "inout";

const style: CSSProperties = { color: "var(--text-muted)", whiteSpace: "nowrap" };

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant,
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant: RunCostBadgeVariant;
}) {
  const t = useTranslations("prReview");
  const cost = formatCost(costUsd);
  const hasTokens = tokensIn != null && tokensOut != null;

  let text = cost;
  if (variant === "timeline" && hasTokens) {
    text = `${t("timeline.tokens", { count: (tokensIn + tokensOut).toLocaleString("en-US") })} · ${cost}`;
  } else if (variant === "inout" && hasTokens && costUsd != null) {
    text = `${cost} · ${formatTokens(tokensIn, tokensOut)}`;
  }

  return (
    <span className="mono tnum" style={style}>
      {text}
    </span>
  );
}
