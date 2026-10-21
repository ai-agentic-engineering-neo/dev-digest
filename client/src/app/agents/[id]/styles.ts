import type { CSSProperties } from "react";

/** Co-located styles for the agent editor page: the Agents column and the editor frame. */
export const s = {
  page: { display: "flex", height: "calc(100vh - 52px)", minHeight: 0 } satisfies CSSProperties,
  column: {
    width: 300,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  columnHead: { display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 10px" } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1, margin: 0 } satisfies CSSProperties,
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
  searchInput: { flex: 1, fontSize: 13, background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", minWidth: 0 } satisfies CSSProperties,
  list: { flex: 1, minHeight: 0, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  skeleton: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  pane: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0, flexWrap: "wrap" } satisfies CSSProperties,
  chip: { width: 30, height: 30, borderRadius: 8, display: "inline-grid", placeItems: "center", background: "var(--accent-bg)", color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  headerRight: { marginLeft: "auto" } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
} as const;
