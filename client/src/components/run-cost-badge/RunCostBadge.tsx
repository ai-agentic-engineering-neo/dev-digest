/* RunCostBadge — what an agent run cost. `compact` is the bare amount (PR list
   COST column); `full` adds the token total (Agent runs timeline). */
import React from "react";
import { formatCost } from "@/lib/format-cost";

type Props =
  | { variant: "compact"; usd: number | null | undefined }
  | {
      variant: "full";
      usd: number | null | undefined;
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
    };

export function RunCostBadge(props: Props) {
  const cost = formatCost(props.usd);
  const color = props.usd == null ? "var(--text-muted)" : "var(--text-secondary)";
  if (props.variant === "compact") {
    return (
      <span className="mono" style={{ fontSize: 12, color }}>
        {cost}
      </span>
    );
  }
  const tokens = (props.tokensIn ?? 0) + (props.tokensOut ?? 0);
  return (
    <span className="mono" style={{ fontSize: 11, color }}>
      {tokens.toLocaleString("en-US")} tok · {cost}
    </span>
  );
}
