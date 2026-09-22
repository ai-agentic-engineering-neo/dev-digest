import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  block: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" } satisfies CSSProperties,
  header: {
    margin: 0,
    padding: "10px 16px",
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  body: { padding: 16, fontSize: 14, background: "var(--bg-elevated)" } satisfies CSSProperties,
} as const;
