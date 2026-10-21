import type { CSSProperties } from "react";

export const s = {
  summary: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
