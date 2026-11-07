import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  note: { fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
