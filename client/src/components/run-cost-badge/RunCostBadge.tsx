/* RunCostBadge — a run's cost (and, in the banner, token usage). Ported from
   the design's CostBadge.
   compact → "$0.012" (PR list COST column, timeline rows)
   banner  → "$0.014 – 8.2K → 1.3K" (verdict banner; tokens in a muted span)
   No cost data renders "--" (never $0.00); tokens are only shown next to a real cost. */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { NO_DATA, formatCostUsd, formatTokens } from "./format";

export type RunCostBadgeVariant = "compact" | "banner";

const s = {
  cost: (variant: RunCostBadgeVariant): CSSProperties => ({
    fontSize: variant === "banner" ? 13 : 11.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
  }),
  tokens: { fontWeight: 400, color: "var(--text-muted)" } satisfies CSSProperties,
  none: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};

export function RunCostBadge({
  variant,
  costUsd,
  tokensIn,
  tokensOut,
}: {
  variant: RunCostBadgeVariant;
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  const t = useTranslations("prReview");
  const cost = formatCostUsd(costUsd);
  if (cost === NO_DATA) {
    return (
      <span className="mono" style={s.none} title={t("cost.noneTitle")}>
        {t("cost.none")}
      </span>
    );
  }
  const showTokens = variant === "banner" && tokensIn != null && tokensOut != null;
  return (
    <span className="mono tnum" style={s.cost(variant)} title={t("cost.title")}>
      {cost}
      {showTokens && (
        <>
          {" "}
          <span style={s.tokens}>
            {t("cost.tokens", { tokensIn: formatTokens(tokensIn), tokensOut: formatTokens(tokensOut) })}
          </span>
        </>
      )}
    </span>
  );
}

export default RunCostBadge;
