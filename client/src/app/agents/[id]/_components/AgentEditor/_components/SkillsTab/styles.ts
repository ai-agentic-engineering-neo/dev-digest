import type { CSSProperties } from "react";

/** Co-located styles for the agent SkillsTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  manage: { fontSize: 13, color: "var(--accent-text)" } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    maxWidth: 320,
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-muted)", margin: "10px 0 14px" } satisfies CSSProperties,
  list: { padding: 0, margin: "0 0 8px", display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
