import type { CSSProperties } from "react";

/** Co-located styles for RunCostBadge (ported from the design's CostBadge). */
export const s = {
  wrap: (size: "sm" | "lg", empty: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: size === "lg" ? 13 : 11.5,
    fontWeight: empty ? 400 : 500,
    color: empty ? "var(--text-muted)" : "var(--text-secondary)",
    whiteSpace: "nowrap",
  }),
  tokens: { color: "var(--text-muted)", fontWeight: 400 } satisfies CSSProperties,
} as const;
