import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    gap: 2,
    padding: 2,
    borderRadius: 7,
  } satisfies CSSProperties,
} as const;
