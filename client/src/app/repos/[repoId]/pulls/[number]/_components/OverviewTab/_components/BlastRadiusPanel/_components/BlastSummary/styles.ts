import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 6, minWidth: 0 } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  num: { color: "var(--text-primary)", fontWeight: 650 } satisfies CSSProperties,
} as const;
