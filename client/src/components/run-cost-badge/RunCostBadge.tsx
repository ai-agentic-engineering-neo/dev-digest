/* RunCostBadge — what an agent run cost. Two variants:
   compact  → "$0.014"            (PR list COST column)
   detailed → "9,119 tok · $0.014" (run row in the Agent runs timeline)
   Unknown cost/tokens render "—", never "$0.00". */
"use client";

import { useTranslations } from "next-intl";
import { formatCost, formatTokenTotal } from "@/lib/format";

export interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  variant?: "compact" | "detailed";
  tokensIn?: number | null;
  tokensOut?: number | null;
}

export function RunCostBadge({ costUsd, variant = "compact", tokensIn, tokensOut }: RunCostBadgeProps) {
  const t = useTranslations("prReview");
  const cost = formatCost(costUsd);
  const hasTokens = tokensIn != null && tokensOut != null && tokensIn + tokensOut > 0;
  const text =
    variant === "detailed" && hasTokens
      ? `${t("cost.tokens", { count: formatTokenTotal(tokensIn, tokensOut) })} · ${cost}`
      : cost;
  return (
    <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

export default RunCostBadge;
