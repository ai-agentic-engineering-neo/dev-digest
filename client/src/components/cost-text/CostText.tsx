/* CostText — compact USD cost of a run / PR (local stand-in for the design's
   CostBadge; @devdigest/ui is vendored and not edited). Unknown cost renders a
   muted "—"; the exact value is in the tooltip. */
import React from "react";
import { formatUsd, formatUsdExact } from "@/lib/format-usage";

export function CostText({
  usd,
  style,
}: {
  usd: number | null | undefined;
  style?: React.CSSProperties;
}) {
  const known = usd != null && Number.isFinite(usd);
  return (
    <span
      className="mono tnum"
      title={known ? formatUsdExact(usd) : undefined}
      style={{ color: known ? "inherit" : "var(--text-muted)", ...style }}
    >
      {formatUsd(usd)}
    </span>
  );
}

export default CostText;
