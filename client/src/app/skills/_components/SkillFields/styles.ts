import type { CSSProperties } from "react";

export const s = {
  tokens: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  readOnlyBody: (rows: number): CSSProperties => ({
    margin: 0,
    maxHeight: rows * 20,
    overflow: "auto",
    padding: 12,
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
  }),
} as const;
