import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffGroup — CSS variables only. */
export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
} as const;
