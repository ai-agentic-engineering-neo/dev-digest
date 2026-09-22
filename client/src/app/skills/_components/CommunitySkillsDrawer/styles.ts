import type { CSSProperties } from "react";

/** Co-located styles for CommunitySkillsDrawer. */
export const s = {
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 12,
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
  chips: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 } satisfies CSSProperties,
  error: {
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    fontSize: 13,
    marginBottom: 12,
  } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  rowTitle: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  desc: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 } satisfies CSSProperties,
  rowMeta: { display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
