import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10, fontSize: 13 } satisfies CSSProperties,
  summary: { color: "var(--text-secondary)" } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  groupLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  path: {
    fontSize: 12,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  none: { color: "var(--text-muted)" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  unavailable: { color: "var(--warn)" } satisfies CSSProperties,
};
