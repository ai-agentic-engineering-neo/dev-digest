/* RunCostBadge — what a review run (or a PR's latest runs) cost.
   compact  → "$0.014"               (PR list COST column)
   detailed → "9,119 tok · $0.0013"  (Agent runs timeline, under the run time)
   Spec: client/specs/run-cost-badge.md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatTokenCount, formatUsd } from "@/lib/format-cost";

type Usd = number | null | undefined;
type Tokens = number | null | undefined;

export type RunCostBadgeProps =
  | { variant: "compact"; usd: Usd }
  | { variant: "detailed"; usd: Usd; tokensIn: Tokens; tokensOut: Tokens };

const base: React.CSSProperties = { fontSize: 12, whiteSpace: "nowrap" };
const known: React.CSSProperties = { ...base, color: "var(--text-secondary)" };
const unknown: React.CSSProperties = { ...base, color: "var(--text-muted)" };

export function RunCostBadge(props: RunCostBadgeProps) {
  const t = useTranslations("common");

  if (props.variant === "compact") {
    return (
      <span className="mono tnum" style={props.usd == null ? unknown : known}>
        {formatUsd(props.usd)}
      </span>
    );
  }

  const tokensIn = props.tokensIn ?? 0;
  const tokensOut = props.tokensOut ?? 0;
  const tokens = tokensIn + tokensOut;
  // No usage at all (e.g. failed before any LLM call) → render nothing.
  if (tokens === 0 && props.usd == null) return null;

  const cost = formatUsd(props.usd);
  return (
    <span
      className="mono tnum"
      style={known}
      title={t("cost.tooltip", {
        tokensIn: formatTokenCount(tokensIn),
        tokensOut: formatTokenCount(tokensOut),
        cost,
      })}
    >
      {formatTokenCount(tokens)} {t("cost.tokensShort")} · {cost}
    </span>
  );
}
