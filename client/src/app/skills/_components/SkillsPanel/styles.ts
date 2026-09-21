import type { CSSProperties } from "react";

/** Co-located styles for SkillsPanel (left column of /skills/[id]). */
export const s = {
  wrap: {
    width: 340,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  head: { padding: "16px 16px 12px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  scroll: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  noMatch: { fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" } satisfies CSSProperties,
} as const;
