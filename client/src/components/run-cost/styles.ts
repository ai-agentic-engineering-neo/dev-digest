import type { CSSProperties } from "react";

/** Co-located styles for RunCostBadge. */
export const s = {
  compact: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  detailed: { fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
