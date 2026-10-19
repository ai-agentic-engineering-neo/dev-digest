import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  row: { display: "flex", gap: 12 } satisfies CSSProperties,
  grow: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  category: { width: 180 } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
