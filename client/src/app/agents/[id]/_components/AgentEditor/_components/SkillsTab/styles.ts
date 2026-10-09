import type { CSSProperties } from "react";

/** Co-located styles for the SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  hint: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    marginBottom: 16,
  } satisfies CSSProperties,
  filter: { marginBottom: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: dragging ? 0.5 : 1,
  }),
  handle: {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--text-muted)",
    cursor: "grab",
    background: "none",
    border: "none",
    padding: 0,
  } satisfies CSSProperties,
  name: { fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
} as const;
