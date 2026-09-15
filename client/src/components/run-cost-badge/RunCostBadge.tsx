/* RunCostBadge — cost (and optionally tokens) of an agent run. Ported from the
   design's CostBadge. Two variants:
   - compact:  "$0.012"              (PR list COST column)
   - detailed: "$0.014 · 8.2K→1.3K"  (verdict plate, timeline row)
   A missing cost renders "—" (never "$0.00"); tokens still show when known. */
"use client";

import { useTranslations } from "next-intl";
import { formatTokensK, formatUsd, NO_DATA } from "./helpers";
import { s } from "./styles";

export function RunCostBadge({
  usd,
  tokensIn,
  tokensOut,
  variant = "compact",
  size = "sm",
}: {
  usd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
  size?: "sm" | "lg";
}) {
  const t = useTranslations("common");
  const cost = formatUsd(usd);
  const tokens =
    variant === "detailed" && tokensIn != null && tokensOut != null
      ? `${formatTokensK(tokensIn)}→${formatTokensK(tokensOut)}`
      : null;
  const empty = cost === NO_DATA && tokens == null;
  return (
    <span className="mono tnum" title={empty ? undefined : t("runCost.title")} style={s.wrap(size, empty)}>
      {cost}
      {tokens && <span style={s.tokens}>· {tokens}</span>}
    </span>
  );
}

export default RunCostBadge;
