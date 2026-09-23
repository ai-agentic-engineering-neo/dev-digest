/* RunCostBadge — what one review run cost (server/specs/01-run-cost-badge.md).
   `compact` → "$0.014" (PR list, run-drawer Stats tile); `detailed` →
   "$0.0013 · 8.2K→1.3K" (Agent runs timeline, Review runs accordion). Unknown
   cost renders "—", never "$0.00". Wordless, so it needs no i18n; colour and
   font size come from the parent. */
import type { CSSProperties } from "react";
import { formatTokenPair, formatUsd } from "./helpers";
import { s } from "./styles";

export interface RunCostBadgeProps {
  variant: "compact" | "detailed";
  costUsd: number | null | undefined;
  /** Used by `detailed` only. */
  tokensIn?: number | null;
  tokensOut?: number | null;
  style?: CSSProperties;
}

export function RunCostBadge({ variant, costUsd, tokensIn, tokensOut, style }: RunCostBadgeProps) {
  const cost = formatUsd(costUsd);
  const tokens = variant === "detailed" ? formatTokenPair(tokensIn, tokensOut) : null;
  return (
    <span className="mono tnum" style={{ ...s.badge, ...style }}>
      {tokens ? `${cost} · ${tokens}` : cost}
    </span>
  );
}
