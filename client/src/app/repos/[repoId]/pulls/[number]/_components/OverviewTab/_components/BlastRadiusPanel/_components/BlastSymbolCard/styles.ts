import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  symbol: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  file: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0 } satisfies CSSProperties,
  location: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  caller: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
