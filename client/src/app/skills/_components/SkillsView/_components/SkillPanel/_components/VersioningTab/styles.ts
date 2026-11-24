import type { CSSProperties } from "react";

export const s = {
  hint: { fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  version: { fontWeight: 650, fontSize: 14, minWidth: 40 } satisfies CSSProperties,
  date: { flex: 1, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
  message: { fontSize: 13.5, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
} as const;
