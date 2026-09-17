import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilterChip. */
export const s = {
  chip: (color: string, bg: string, active: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    cursor: "pointer",
    transition: "all .12s",
    border: "1px solid " + (active ? color : "var(--border)"),
    background: active ? bg : "transparent",
    color: active ? color : "var(--text-secondary)",
  }),
} as const;
