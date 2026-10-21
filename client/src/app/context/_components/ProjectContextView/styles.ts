import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView: the two-pane frame. The file
    panel and the document pane carry their own styles. */
export const s = {
  page: { display: "flex", alignItems: "stretch", height: "100%", minHeight: "calc(100vh - 52px)" } satisfies CSSProperties,
  state: { flex: 1, minWidth: 0, display: "grid", placeItems: "center", padding: 24 } satisfies CSSProperties,
} as const;
