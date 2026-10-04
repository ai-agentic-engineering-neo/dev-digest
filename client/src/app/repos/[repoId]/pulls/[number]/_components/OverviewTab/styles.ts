import type { CSSProperties } from "react";

export const s = {
  briefGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  slot: { minWidth: 0 } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
