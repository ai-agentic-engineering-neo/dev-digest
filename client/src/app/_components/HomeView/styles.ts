import type { CSSProperties } from "react";

/** Co-located styles for HomeView. */
export const s = {
  skeletons: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 } satisfies CSSProperties,
  redirecting: { color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
};
