"use client";

import React from "react";
import { formatCost } from "@/lib/format";

/**
 * Presentational cost badge. Compact, mono-numeric. Used in three places:
 * PR list COST column, RunHistory timeline row, TraceBody Stats section.
 * Null / undefined / exactly 0 → muted em-dash (never "$0.00").
 */
export function RunCostBadge({ cost }: { cost: number | null | undefined }) {
  const value = formatCost(cost);
  const muted = value === "—";
  return (
    <span
      className="mono"
      style={{ color: muted ? "var(--muted)" : "var(--fg)", fontSize: 13 }}
    >
      {value}
    </span>
  );
}
