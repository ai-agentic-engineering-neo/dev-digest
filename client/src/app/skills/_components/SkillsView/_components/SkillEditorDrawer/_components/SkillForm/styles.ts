import type { CSSProperties } from "react";

export const s = {
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  counter: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  counterOver: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
} as const;
