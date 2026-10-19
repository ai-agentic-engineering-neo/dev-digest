import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "center", gap: 10, padding: "20px 16px 14px" } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  searchWrap: { padding: "0 16px 14px" } satisfies CSSProperties,
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
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 16px 16px" } satisfies CSSProperties,
  noMatch: { fontSize: 13, color: "var(--text-muted)", padding: "12px 4px" } satisfies CSSProperties,
} as const;
