import type { CSSProperties } from "react";

export const s = {
  pane: { width: 380, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", minHeight: 0 } satisfies CSSProperties,
  top: { padding: "20px 20px 12px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  h1: { flex: 1, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, background: "transparent", border: "none", outline: "none", color: "var(--text-primary)" } satisfies CSSProperties,
  list: { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 20px 24px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
