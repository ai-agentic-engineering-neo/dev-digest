import type { CSSProperties } from "react";

export const s = {
  grid: {
    display: "grid",
    // minmax(0, 1fr), not plain 1fr: a grid item's default min-width is
    // `auto` (its content's intrinsic min-content size), so one long
    // unbreakable token (a file path, a URL) inside either card can force
    // its whole column wider than 50% and drag the other card off-screen.
    // minmax(0, ...) caps that at the track size instead.
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
    alignItems: "start",
  } satisfies CSSProperties,
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
