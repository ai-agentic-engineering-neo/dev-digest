import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  message: {
    margin: 0,
    padding: "18px 24px",
    fontSize: 13.5,
    lineHeight: 1.5,
    whiteSpace: "pre-line",
  } satisfies CSSProperties,
};
