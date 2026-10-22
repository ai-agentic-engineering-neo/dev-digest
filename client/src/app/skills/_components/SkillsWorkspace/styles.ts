import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listHead: { padding: "16px 16px 12px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: { position: "relative" } satisfies CSSProperties,
  searchIcon: { position: "absolute", left: 10, top: 10, color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    width: "100%",
    padding: "7px 10px 7px 30px",
    fontSize: 13,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    outline: "none",
  } satisfies CSSProperties,
  scroll: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  spacer: { height: 10 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" } satisfies CSSProperties,
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  center: { flex: 1, display: "grid", placeItems: "center", padding: 28 } satisfies CSSProperties,
} as const;
