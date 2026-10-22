import type { CSSProperties } from "react";

export const s = {
  tabs: { paddingTop: 6 } satisfies CSSProperties,
  body: { padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
} as const;
