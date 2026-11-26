import type { CSSProperties } from "react";

/** Co-located styles for MergeForm. */
export const s = {
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "6px 14px",
    margin: 0,
    fontSize: 13,
  } satisfies CSSProperties,
  term: { color: "var(--text-muted)" } satisfies CSSProperties,
  value: { margin: 0, color: "var(--text-primary)" } satisfies CSSProperties,
  mono: { margin: 0, color: "var(--text-primary)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  rules: {
    margin: 0,
    paddingLeft: 18,
    maxHeight: 220,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  rule: { fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
