import type { CSSProperties } from "react";

export const s = {
  wrap: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  header: { padding: "16px 16px 12px" } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  deleteBody: { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, padding: 24 } satisfies CSSProperties,
  deleteFooter: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
