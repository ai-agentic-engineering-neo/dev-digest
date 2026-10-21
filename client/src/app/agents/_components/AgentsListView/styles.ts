import type { CSSProperties } from "react";

/** Co-located styles for AgentsListView (the states shown before the first agent opens). */
export const s = {
  page: { padding: "24px 32px 44px", display: "grid", placeItems: "center", minHeight: "calc(100vh - 52px)" } satisfies CSSProperties,
  skeleton: { width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
