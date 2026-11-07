import type { CSSProperties } from "react";

/** Co-located styles for DiffToolbar. */
export const s = {
  group: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
