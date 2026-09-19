import React from "react";
import { formatCost } from "@/lib/cost";

type Props =
  | { variant: "compact"; cost: number | null | undefined }
  | {
      variant: "withTokens";
      cost: number | null | undefined;
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
    };

const numeric: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const muted: React.CSSProperties = { ...numeric, color: "var(--text-muted)" };

export function RunCostBadge(props: Props) {
  if (props.variant === "compact") {
    return <span style={props.cost == null ? muted : numeric}>{formatCost(props.cost)}</span>;
  }

  const totalTokens = (props.tokensIn ?? 0) + (props.tokensOut ?? 0);
  if (totalTokens === 0 && props.cost == null) return <span style={muted}>—</span>;

  return (
    <span style={muted}>
      {totalTokens.toLocaleString("en-US")} tok · {formatCost(props.cost)}
    </span>
  );
}
