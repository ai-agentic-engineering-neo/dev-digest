/* RunCostBadge — what a run (or a whole PR's reviewing) cost in USD.
   Used in the PR list COST column, the run timeline, and the verdict banner. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCost, formatTokenFlow, NO_DATA } from "@/lib/format";
import { s } from "./styles";

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  /** Null/undefined = no cost data: a failed run, or a model with no price. */
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** compact: "$0.012" · detailed: "$0.014 · 8.2K→1.3K" */
  variant?: "compact" | "detailed";
}) {
  const t = useTranslations("prReview");
  const label = formatCost(costUsd);
  const missing = label === NO_DATA;
  // Only the em dash needs explaining; a real number speaks for itself.
  const title = missing ? t("cost.none") : undefined;

  if (variant === "compact") {
    return (
      <span className="mono tnum" style={s.cost(missing)} title={title}>
        {label}
      </span>
    );
  }

  const tokens = formatTokenFlow(tokensIn, tokensOut);
  return (
    <span style={s.detailed} title={title}>
      <span className="mono tnum" style={s.cost(missing)}>
        {label}
      </span>
      {tokens && (
        <>
          <span aria-hidden>·</span>
          <span className="mono tnum" style={s.tokens}>
            {tokens}
          </span>
        </>
      )}
    </span>
  );
}

export default RunCostBadge;
