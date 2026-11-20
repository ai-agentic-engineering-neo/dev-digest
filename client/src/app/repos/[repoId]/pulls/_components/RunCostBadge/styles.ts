import type { CSSProperties } from "react";

export const s = {
  compact: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  full: { fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
};
