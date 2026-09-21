import type { CSSProperties } from "react";

/** Co-located styles for RunCostBadge. */
export const s = {
  cost: (muted: boolean): CSSProperties => ({
    fontSize: 12,
    color: muted ? "var(--text-muted)" : "var(--text-secondary)",
    whiteSpace: "nowrap",
  }),
  detailed: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  tokens: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
