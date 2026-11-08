import type { CSSProperties } from "react";

/** Below ~2 × this width the Intent / Blast radius columns stack. */
const COLUMN_MIN = 400;

export const s = {
  columns: {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${COLUMN_MIN}px), 1fr))`,
    gap: 16,
    alignItems: "stretch",
  } satisfies CSSProperties,
  /** Label row + card row; the card row (1fr) stretches so both cards share the taller one's height. */
  column: { display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0 } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
