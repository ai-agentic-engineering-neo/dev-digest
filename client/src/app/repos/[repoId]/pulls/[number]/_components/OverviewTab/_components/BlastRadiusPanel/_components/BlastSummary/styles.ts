import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
} as const;
