import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  error: { margin: "0 0 10px", fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
