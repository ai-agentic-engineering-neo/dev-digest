import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: "8px 0" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 24px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  body: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  title: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  location: { fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
