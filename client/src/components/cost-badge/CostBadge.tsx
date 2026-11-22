/* CostBadge — compact spend display (PR list, Review Runs accordion).
   Ported from the design's primitives.jsx. Presentational only: no hooks, no i18n —
   the caller passes the (translated) tooltip as `title`. */
import React from "react";
import { formatCost } from "@/lib/format-cost";

/** `usd` null/undefined ⇒ em-dash (no run yet, failed run, or unknown model price). */
export function CostBadge({ usd, title }: { usd: number | null | undefined; title?: string }) {
  if (usd == null) {
    return (
      <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
        —
      </span>
    );
  }
  return (
    <span
      className="mono tnum"
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        color: "var(--text-secondary)",
        fontWeight: 500,
      }}
    >
      {formatCost(usd)}
    </span>
  );
}
