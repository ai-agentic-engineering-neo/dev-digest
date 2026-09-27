import type { CSSProperties } from "react";

/** Co-located styles for the /skills two-pane layout. */
export const s = {
  page: { display: "flex", height: "calc(100vh - 52px)", minHeight: 0 } satisfies CSSProperties,
  /** The right pane: whichever page is active fills it, and scrolls inside it. */
  pane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
} as const;
