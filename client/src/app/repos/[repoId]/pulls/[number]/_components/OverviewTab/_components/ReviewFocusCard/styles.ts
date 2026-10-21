import type { CSSProperties } from "react";

export const s = {
  headRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4, margin: "12px 0 0", padding: 0, listStyle: "none" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    width: "100%",
    padding: "6px 8px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  ref: { color: "var(--accent-text)", whiteSpace: "nowrap" } satisfies CSSProperties,
  empty: { margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
