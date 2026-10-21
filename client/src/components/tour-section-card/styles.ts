import type { CSSProperties } from "react";

export const s = {
  card: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  tile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { flex: 1, margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  chevron: (collapsed: boolean): CSSProperties => ({
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    display: "inline-flex",
    transform: collapsed ? "rotate(180deg)" : "none",
    transition: "transform .12s",
  }),
  body: { marginTop: 16 } satisfies CSSProperties,
};
