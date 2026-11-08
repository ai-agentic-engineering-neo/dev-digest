import type { CSSProperties } from "react";

export const s = {
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 24px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  input: {
    flex: 1,
    minWidth: 0,
    padding: "6px 8px",
    fontSize: 13,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: "14px 24px",
    fontSize: 12,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    maxHeight: "58vh",
    overflow: "auto",
  } satisfies CSSProperties,
  mark: { background: "var(--warn-bg)", color: "var(--warn)", borderRadius: 2 } satisfies CSSProperties,
  empty: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
