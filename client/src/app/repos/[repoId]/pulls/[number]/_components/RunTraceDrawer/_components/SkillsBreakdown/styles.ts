import type { CSSProperties } from "react";

export const s = {
  list: { margin: "4px 0 8px 22px", padding: 0, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  item: { display: "flex", gap: 10, lineHeight: 1.8 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
