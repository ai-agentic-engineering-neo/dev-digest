import type { CSSProperties } from "react";

/** Styles for RunCostBadge — mono, muted, inline. */
export const s = {
  badge: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
