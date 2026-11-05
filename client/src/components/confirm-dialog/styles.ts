import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", minWidth: 0 } satisfies CSSProperties,
} as const;
