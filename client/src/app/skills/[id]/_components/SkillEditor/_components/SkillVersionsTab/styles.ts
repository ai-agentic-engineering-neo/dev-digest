import type { CSSProperties } from "react";

/** Co-located styles for SkillVersionsTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    marginBottom: 10,
    overflow: "hidden",
  } satisfies CSSProperties,
  rowBtn: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "12px 14px",
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
  } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  time: { marginLeft: "auto", color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  body: {
    padding: "14px 18px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  viewToggle: { display: "flex", gap: 6, marginBottom: 12 } satisfies CSSProperties,
} as const;
