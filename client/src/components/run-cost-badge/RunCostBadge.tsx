/* RunCostBadge — LLM cost of one review run, in the four shapes the design uses:
     "cell"     PR list COST column        `$0.014`, unknown → `–`
     "cost"     review run header          `$0.0017` next to the run time
     "usage"    verdict banner, PR score   `$ $0.014  8.2K→1.3K`
     "tokTotal" timeline row, under time   `9,119 tok · $0.0013`
   Unknown cost never renders as `$0.00`: "cell" shows a dash, every other
   variant renders nothing. Strings come from the caller so the component stays
   namespace-agnostic. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { formatUsd } from "@/lib/format-usd";

export type RunCostVariant = "cell" | "cost" | "usage" | "tokTotal";

/** Compact token count: 950 → "950", 8240 → "8.2K", 16181 → "16.2K". */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? k.toFixed(0) : k.toFixed(1)}K`;
}

const mono: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" };
const muted: React.CSSProperties = { ...mono, color: "var(--text-muted)" };
const usageRow: React.CSSProperties = { ...mono, display: "inline-flex", alignItems: "center", gap: 6 };
const usageCost: React.CSSProperties = { color: "var(--text-primary)", fontWeight: 600 };
const usageTokens: React.CSSProperties = { color: "var(--text-muted)" };

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "cell",
  title,
  ariaLabel,
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: RunCostVariant;
  /** Tooltip, e.g. "LLM cost of the latest review run". */
  title?: string;
  /** Accessible name; receives the formatted cost. */
  ariaLabel?: (cost: string) => string;
}) {
  if (costUsd == null) {
    if (variant !== "cell") return null;
    return (
      <span data-testid="run-cost-badge" data-empty="true" className="mono" style={muted}>
        –
      </span>
    );
  }
  const cost = formatUsd(costUsd);
  const common = { "data-testid": "run-cost-badge", title, "aria-label": ariaLabel?.(cost) };
  const hasTokens = tokensIn != null && tokensOut != null;

  if (variant === "usage") {
    return (
      <span {...common} className="mono" style={usageRow}>
        <Icon.DollarSign size={12} style={usageTokens} />
        <span style={usageCost}>{cost}</span>
        {hasTokens && (
          <span style={usageTokens}>
            {formatTokenCount(tokensIn!)}→{formatTokenCount(tokensOut!)}
          </span>
        )}
      </span>
    );
  }

  if (variant === "tokTotal") {
    const tok = hasTokens ? `${(tokensIn! + tokensOut!).toLocaleString("en-US")} tok · ` : "";
    return (
      <span {...common} className="mono" style={mono}>
        {tok}
        {cost}
      </span>
    );
  }

  // "cell" and "cost": the amount alone.
  return (
    <span {...common} className="mono" style={mono}>
      {cost}
    </span>
  );
}

export default RunCostBadge;
