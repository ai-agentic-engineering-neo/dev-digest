import type { CSSProperties } from "react";

export const s = {
  briefGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  /** When Blast Radius lands, switch grid to `1fr 1fr` and drop this span. */
  intentSlot: { minWidth: 0, gridColumn: "1 / -1" } satisfies CSSProperties,
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
