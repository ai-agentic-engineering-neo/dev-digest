import type { CSSProperties } from "react";

export const s = {
  wrap: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 1080,
    margin: "0 auto",
  } satisfies CSSProperties,
} as const;
