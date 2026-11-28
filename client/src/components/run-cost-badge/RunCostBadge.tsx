/* RunCostBadge — LLM cost of one review run, shared by the PR list COST column
   ("compact": `$0.012`) and the review run header on the PR page ("detailed":
   `$0.014 · 8.2K→1.3K`). Unknown cost never renders as `$0.00`: the compact
   variant shows `—`, the detailed variant renders nothing. Strings come from
   the caller so the component stays namespace-agnostic. */
"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import { formatUsd } from "@/lib/format-usd";

/** Compact token count: 950 → "950", 8240 → "8.2K", 16181 → "16.2K". */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? k.toFixed(0) : k.toFixed(1)}K`;
}

const mutedDash: React.CSSProperties = { color: "var(--text-muted)" };
const compactBadge: React.CSSProperties = { fontSize: 11.5, padding: "0 6px" };
const detailedText: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
  title,
  ariaLabel,
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
  /** Tooltip, e.g. "LLM cost of the latest review run". */
  title?: string;
  /** Accessible name; receives the formatted cost. */
  ariaLabel?: (cost: string) => string;
}) {
  if (costUsd == null) {
    if (variant === "detailed") return null;
    return (
      <span data-testid="run-cost-badge" data-empty="true" style={mutedDash}>
        —
      </span>
    );
  }
  const cost = formatUsd(costUsd);
  const label = ariaLabel?.(cost);

  if (variant === "compact") {
    return (
      <span data-testid="run-cost-badge" title={title} aria-label={label}>
        <Badge mono color="var(--text-secondary)" style={compactBadge}>
          {cost}
        </Badge>
      </span>
    );
  }

  const tokens =
    tokensIn != null && tokensOut != null
      ? ` · ${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`
      : "";
  return (
    <span
      data-testid="run-cost-badge"
      className="mono"
      title={title}
      aria-label={label}
      style={detailedText}
    >
      {cost}
      {tokens}
    </span>
  );
}

export default RunCostBadge;
