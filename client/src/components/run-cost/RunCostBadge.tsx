/* RunCostBadge — per-run cost in two forms:
   compact  → "$0.014"                (PR list COST column)
   detailed → "9,119 tok · $0.0013"   (Agent runs timeline, under the run time)
   Missing cost renders "—", never "$0.00". The caller passes an already
   translated tokens label so this component stays i18n-namespace agnostic. */
import React from "react";
import { formatCost } from "./helpers";
import { s } from "./styles";

export type RunCostBadgeProps =
  | { variant: "compact"; usd: number | null | undefined }
  | { variant: "detailed"; usd: number | null | undefined; tokensLabel?: string | null };

export function RunCostBadge(props: RunCostBadgeProps) {
  const cost = formatCost(props.usd);
  if (props.variant === "compact") {
    return (
      <span className="mono" style={s.compact}>
        {cost}
      </span>
    );
  }
  return (
    <span className="mono" style={s.detailed}>
      {props.tokensLabel ? `${props.tokensLabel} · ${cost}` : cost}
    </span>
  );
}
