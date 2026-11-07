import type { CSSProperties } from "react";

export const s = {
  group: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 } satisfies CSSProperties,
  more: {
    background: "none",
    border: "none",
    padding: "2px 4px",
    fontSize: 12,
    cursor: "pointer",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
} as const;
