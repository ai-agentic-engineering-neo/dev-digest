import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 780 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  } satisfies CSSProperties,
  version: { fontSize: 13, fontWeight: 600, flexShrink: 0 } satisfies CSSProperties,
  note: {
    flex: 1,
    fontSize: 13,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  actions: { display: "flex", gap: 6, flexShrink: 0 } satisfies CSSProperties,
} as const;
