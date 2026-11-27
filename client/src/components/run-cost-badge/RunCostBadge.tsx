/* RunCostBadge — M1 run cost badge. Presentational only (no data fetching).
   - compact: "$0.014"                 → PR list COST column
   - inline:  "9,119 tok · $0.0013"    → Agent-runs timeline card
   Missing data renders "—", never "$0.00". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatInt, formatTokenTotal, formatUsd, formatUsdPrecise, NO_VALUE } from "@/lib/format-cost";

export type RunCostBadgeProps =
  | { variant: "compact"; costUsd: number | null | undefined }
  | {
      variant: "inline";
      costUsd: number | null | undefined;
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
    };

const style: React.CSSProperties = { color: "var(--text-muted)", whiteSpace: "nowrap" };

export function RunCostBadge(props: RunCostBadgeProps) {
  const t = useTranslations("prReview.costBadge");
  const cost = formatUsd(props.costUsd);

  if (props.variant === "compact") {
    return (
      <span
        className="mono tnum"
        style={style}
        title={props.costUsd == null ? undefined : formatUsdPrecise(props.costUsd)}
      >
        {cost}
      </span>
    );
  }

  const tokens = formatTokenTotal(props.tokensIn, props.tokensOut);
  if (tokens == null && props.costUsd == null) {
    return (
      <span className="mono tnum" style={style}>
        {NO_VALUE}
      </span>
    );
  }
  const title = t("tooltip", {
    cost: formatUsdPrecise(props.costUsd),
    tokensIn: formatInt(props.tokensIn ?? 0),
    tokensOut: formatInt(props.tokensOut ?? 0),
  });
  return (
    <span className="mono tnum" style={style} title={title}>
      {tokens != null && `${t("tokens", { total: tokens })} · `}
      {cost}
    </span>
  );
}
