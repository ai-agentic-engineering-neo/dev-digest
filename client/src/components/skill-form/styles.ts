import type { CSSProperties } from "react";

export const s = {
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
} as const;
