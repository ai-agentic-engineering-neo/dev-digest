import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 4, gap: 16 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  filterRow: { margin: "14px 0" } satisfies CSSProperties,
  orderHint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  row: (dragOver: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    background: dragOver ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  handle: { color: "var(--text-muted)", cursor: "grab", display: "flex", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0 } satisfies CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  empty: { padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
