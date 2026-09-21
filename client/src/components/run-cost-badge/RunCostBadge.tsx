/* RunCostBadge — compact USD cost display, shared by the PR list (compact
   variant) and the PR run timeline (detailed variant, cost + token delta).
   Plain mono text, not a pill — matches how every other numeric value in
   these views renders (timestamps, model/provider, stat-tile values). */
import type { CSSProperties } from "react";
import { formatCost } from "@/lib/format-cost";

/** "12k→1.5k" token in→out summary; standalone (not imported across the
    RunTraceDrawer route boundary) since this component is shared cross-route. */
function formatTokenDelta(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

const textStyle: CSSProperties = { fontVariantNumeric: "tabular-nums" };

type RunCostBadgeProps =
  | { variant: "compact"; costUsd: number | null | undefined }
  | {
      variant: "detailed";
      costUsd: number | null | undefined;
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
    };

export function RunCostBadge(props: RunCostBadgeProps) {
  const cost = formatCost(props.costUsd);
  if (props.variant === "compact") {
    return (
      <span className="mono" style={textStyle}>
        {cost}
      </span>
    );
  }
  const hasTokens = props.tokensIn != null && props.tokensOut != null;
  return (
    <span className="mono" style={textStyle}>
      {cost}
      {hasTokens ? ` · ${formatTokenDelta(props.tokensIn!, props.tokensOut!)}` : ""}
    </span>
  );
}

export default RunCostBadge;
