/* RunCostBadge — USD spend (and optionally tokens) of an agent run.
   compact:  "$0.014"               (PR list COST column)
   detailed: "9,119 tok · $0.0013"  (PR timeline run card) */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCost, formatTokenCount } from "@/lib/format-cost";

export type RunCostBadgeProps = {
  costUsd: number | null | undefined;
  variant?: "compact" | "detailed";
  /** Total tokens (in + out); only shown by the detailed variant. */
  tokens?: number | null;
  style?: React.CSSProperties;
};

const base: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
};

export function RunCostBadge({ costUsd, variant = "compact", tokens, style }: RunCostBadgeProps) {
  const t = useTranslations("common.runCost");
  const hasCost = costUsd != null;
  const hasTokens = variant === "detailed" && tokens != null && tokens > 0;

  if (!hasCost && !hasTokens) {
    return (
      <span className="mono" style={{ ...base, color: "var(--text-muted)", ...style }} aria-label={t("unknown")}>
        —
      </span>
    );
  }

  const parts: string[] = [];
  if (hasTokens) parts.push(t("tokens", { count: formatTokenCount(tokens!) }));
  if (hasCost) parts.push(formatCost(costUsd));

  return (
    <span className="mono tnum" style={{ ...base, ...style }} title={t("title")}>
      {parts.join(" · ")}
    </span>
  );
}
