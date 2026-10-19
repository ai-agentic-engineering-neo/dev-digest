/* RunCostBadge — LLM spend of a review run (Run Cost Badge feature).
   - compact:  "$0.014" (PR list COST column); unknown → "—".
   - detailed: "9 119 tok · $0.0013" (run timeline card); renders nothing when
     the run has neither tokens nor a cost (e.g. a failed run). */
"use client";

import { formatCost, formatTokenCount, NO_COST } from "@/lib/format-cost";
import { s } from "./styles";

type Props =
  | { variant: "compact"; costUsd: number | null | undefined }
  | {
      variant: "detailed";
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
      costUsd: number | null | undefined;
    };

export function RunCostBadge(props: Props) {
  if (props.variant === "compact") {
    const text = formatCost(props.costUsd);
    return (
      <span className="mono" style={text === NO_COST ? { ...s.compact, ...s.muted } : s.compact}>
        {text}
      </span>
    );
  }

  const tokens = (props.tokensIn ?? 0) + (props.tokensOut ?? 0);
  const hasCost = props.costUsd != null;
  if (tokens <= 0 && !hasCost) return null;
  const parts = [
    tokens > 0 ? `${formatTokenCount(tokens)} tok` : null,
    hasCost ? formatCost(props.costUsd) : null,
  ].filter(Boolean);
  return (
    <span className="mono" style={s.detailed}>
      {parts.join(" · ")}
    </span>
  );
}

export default RunCostBadge;
