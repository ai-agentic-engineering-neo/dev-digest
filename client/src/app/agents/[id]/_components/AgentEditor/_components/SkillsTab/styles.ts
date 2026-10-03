import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  hint: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    marginBottom: 16,
  } satisfies CSSProperties,
  filterRow: { maxWidth: 320, marginBottom: 10 } satisfies CSSProperties,
  countNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  dragHandle: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    padding: 0,
    border: "none",
    background: "none",
    color: "var(--text-muted)",
    cursor: "grab",
    touchAction: "none",
  } satisfies CSSProperties,
  name: { flex: 1, fontSize: 14, color: "var(--text-primary)", fontWeight: 500 } satisfies CSSProperties,
  empty: {
    padding: "24px 0",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
