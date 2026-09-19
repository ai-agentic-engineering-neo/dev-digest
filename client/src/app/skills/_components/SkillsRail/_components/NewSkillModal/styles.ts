import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  slugError: { fontSize: 12, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
} as const;
