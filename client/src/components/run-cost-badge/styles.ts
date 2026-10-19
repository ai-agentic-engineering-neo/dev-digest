import type { CSSProperties } from "react";

export const s = {
  compact: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  detailed: { fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
