import type { CSSProperties } from "react";

/** Co-located styles for SkillsView: the Skills column and the editor frame. */
export const s = {
  page: { display: "flex", height: "calc(100vh - 52px)", minHeight: 0 } satisfies CSSProperties,
  column: {
    width: 320,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  columnHead: { display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 10px" } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1, letterSpacing: "-0.01em" } satisfies CSSProperties,
  searchWrap: { padding: "0 16px 12px" } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
    minWidth: 0,
  } satisfies CSSProperties,
  list: { flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "0 12px 16px" } satisfies CSSProperties,
  empty: { flex: 1, minWidth: 0, display: "grid", placeItems: "center", padding: 24 } satisfies CSSProperties,
} as const;
