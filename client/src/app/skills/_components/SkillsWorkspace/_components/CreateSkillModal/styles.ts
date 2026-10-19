import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  error: { marginRight: "auto", fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
