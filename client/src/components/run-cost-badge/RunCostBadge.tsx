/* RunCostBadge — the per-run USD cost display, in the 2 shapes it's used in:
   a bare cost ("compact", the PR-list cell and the trace drawer's Stats box)
   and cost bundled with the run's token count ("withTokens", the Agent runs
   timeline row). Never renders "$0.00" for missing data — see format.ts. */
"use client";

import React from "react";
import { formatRunCost, formatTokenCount } from "./format";

export function RunCostBadge({
  usd,
  variant = "compact",
  tokensIn = 0,
  tokensOut = 0,
}: {
  usd: number | null | undefined;
  variant?: "compact" | "withTokens";
  /** Only used by the "withTokens" variant. */
  tokensIn?: number;
  tokensOut?: number;
}) {
  const cost = formatRunCost(usd);
  const empty = usd == null;
  const style: React.CSSProperties = empty ? { color: "var(--text-muted)" } : {};

  if (variant === "withTokens") {
    return (
      <span className="mono tnum" style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {formatTokenCount(tokensIn, tokensOut)} · <span style={style}>{cost}</span>
      </span>
    );
  }

  return (
    <span className="mono tnum" style={style}>
      {cost}
    </span>
  );
}

export default RunCostBadge;
