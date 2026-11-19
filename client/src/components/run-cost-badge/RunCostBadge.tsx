/* RunCostBadge — cost (and optionally tokens) of one agent run (M1).
   compact: "$0.012" (PR list, timeline) · full: "$0.014 · 8.2K→1.3K" (verdict banner).
   No data → "—", never "$0.00". */
import React from "react";
import { badgeText, badgeTitle } from "./helpers";
import { s } from "./styles";

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
  style,
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "full";
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="mono"
      data-testid="run-cost-badge"
      title={badgeTitle(costUsd)}
      style={style ? { ...s.badge, ...style } : s.badge}
    >
      {badgeText(variant, costUsd, tokensIn, tokensOut)}
    </span>
  );
}

export default RunCostBadge;
