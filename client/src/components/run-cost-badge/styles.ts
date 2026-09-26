import type { CSSProperties } from "react";

/** Co-located styles for RunCostBadge. Colors come from CSS variables only. */
export const s = {
  compact: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  full: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11.5,
    color: "var(--accent-text)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  empty: {
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
