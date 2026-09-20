import type { CSSProperties } from "react";

export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  detail: { flex: 1, minWidth: 0, overflow: "hidden" } satisfies CSSProperties,
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" } satisfies CSSProperties,
  detailSkeleton: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
