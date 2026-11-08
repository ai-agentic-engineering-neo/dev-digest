import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 } satisfies CSSProperties,
  none: { color: "var(--text-muted)" } satisfies CSSProperties,
  item: { display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  leftOutPath: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
  unavailable: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  changed: {
    fontSize: 11,
    padding: "0 5px",
    borderRadius: 4,
    color: "var(--info)",
    background: "var(--info-bg)",
    cursor: "help",
  } satisfies CSSProperties,
} as const;
