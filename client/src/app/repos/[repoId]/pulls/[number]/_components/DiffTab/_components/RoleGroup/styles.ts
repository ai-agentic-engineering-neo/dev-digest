import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 4px",
    // Page colour, not a surface: reads as no background but still covers
    // the diff scrolling under the sticky header.
    background: "var(--bg-primary)",
    border: "none",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),
  square: (color: string): CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  label: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  counter: { fontSize: 12, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
