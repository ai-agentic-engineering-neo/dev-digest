import type { CSSProperties } from "react";

export const s = {
  // Design practice: a grid whose columns stretch to fill the width (up to 5
  // agents share the row evenly, minmax keeps them readable), instead of
  // fixed-width flex columns that leave dead space on the right.
  scroller: {
    display: "grid",
    gap: 14,
    paddingBottom: 6,
  } satisfies CSSProperties,
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  findings: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  emptyFindings: {
    padding: "16px 4px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
} as const;
