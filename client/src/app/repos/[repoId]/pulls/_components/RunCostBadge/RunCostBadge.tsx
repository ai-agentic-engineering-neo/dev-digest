"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCost } from "./helpers";
import { s } from "./styles";

/**
 * Run cost badge. `compact` = "$0.012" (PR list column); `full` = "9,119 tok · $0.0013"
 * (timeline row; `tokens` is in + out). Unknown cost renders "—".
 */
export function RunCostBadge(
  props: { variant: "compact"; usd: number | null | undefined } | { variant: "full"; usd: number | null | undefined; tokens: number },
) {
  const t = useTranslations("prReview");
  if (props.variant === "compact") {
    return (
      <span className="mono" style={s.compact}>
        {formatCost(props.usd)}
      </span>
    );
  }
  return (
    <span className="mono" style={s.full}>
      {t("cost.tokens", { count: props.tokens })} · {formatCost(props.usd)}
    </span>
  );
}
